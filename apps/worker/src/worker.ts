import type {
  PrIndexJobData,
  PrMatchJobData,
  ThreadReadJobData,
} from "@workspace/schemas/signals";
import { normalizeThreadReadJobData } from "@workspace/schemas/signals";
import {
  createLogger,
  flushSharedLogger,
  initSharedLogger,
  log,
} from "@workspace/utils/logging";
import { drainPendingThreadRead, recoverPendingThreadReads } from "api/queue";
import { Worker } from "bullmq";
import type { Job } from "bullmq";
import Redis from "ioredis";

import { handleCrawlDocumentation } from "./handlers/crawl-documentation";
import { handleIndexPr } from "./handlers/index-pr";
import { handleMatchPr } from "./handlers/match-pr";
import {
  emitQueueLifecycle,
  errorFields,
  createWorkerJobLogger,
} from "./lib/logging";
import { ensureDocumentationCollection } from "./lib/qdrant/documentation";
import { ensureMessagesCollection } from "./lib/qdrant/messages";
import { ensurePrsCollection } from "./lib/qdrant/pull-requests";
import { ensureThreadsCollection } from "./lib/qdrant/threads";
import { executePipeline } from "./pipeline/core/orchestrator";
import { registerDefaultProcessors } from "./pipeline/processors/registration";

const THREAD_PIPELINE_QUEUE = "thread-pipeline";
const CRAWL_DOCUMENTATION_QUEUE = "crawl-documentation";
const PR_INDEX_QUEUE = "pr-index";
const PR_MATCH_QUEUE = "pr-match";

const parseBooleanEnv = (value: string | undefined): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return value.toLowerCase() === "true";
};

initSharedLogger({
  enabled: parseBooleanEnv(process.env.LOGGING_ENABLED),
  environment: process.env.NODE_ENV,
  pretty: parseBooleanEnv(process.env.LOGGING_PRETTY),
  service: "worker",
  silent: parseBooleanEnv(process.env.LOGGING_SILENT),
});

const getRedisConnection = (): Redis => {
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  }

  const redisConfig: {
    host: string;
    port?: number;
    password?: string;
    db?: number;
    maxRetriesPerRequest: null;
  } = {
    host: process.env.REDIS_HOST ?? "localhost",
    maxRetriesPerRequest: null,
  };

  if (process.env.REDIS_PORT) {
    redisConfig.port = Number.parseInt(process.env.REDIS_PORT, 10);
  }

  if (process.env.REDIS_PASSWORD) {
    redisConfig.password = process.env.REDIS_PASSWORD;
  }

  if (process.env.REDIS_DB) {
    redisConfig.db = Number.parseInt(process.env.REDIS_DB, 10);
  }

  return new Redis(redisConfig);
};

const connection = getRedisConnection();

/**
 * Handler for thread-pipeline jobs
 * Runs the full thread pipeline for a single thread. TODO(issue-06): branch on
 * a `supersede` trigger to null thread.agentRead without invoking synthesis.
 */
const handleThreadReadJob = async (job: Job<ThreadReadJobData>) => {
  const { threadId, triggers } = normalizeThreadReadJobData(job.data);
  const loggedThreadId = threadId || "missing";

  const requestLog = createWorkerJobLogger(
    THREAD_PIPELINE_QUEUE,
    job,
    "thread.pipeline",
    {
      thread: { id: loggedThreadId },
      trigger: {
        kinds: triggers.map((trigger) => trigger.kind),
        prMatchedCount: triggers.filter(
          (trigger) => trigger.kind === "pr_matched" && trigger.prMatched
        ).length,
      },
    }
  );
  let status = 200;

  try {
    if (!threadId) {
      status = 400;
      throw new Error("No threadId provided");
    }

    const result = await executePipeline({
      threadIds: [threadId],
      triggers,
    });

    const successRate =
      result.summary.totalThreads > 0
        ? (
            (result.summary.processedThreads / result.summary.totalThreads) *
            100
          ).toFixed(1)
        : "0";

    requestLog.set({
      pipeline: {
        jobId: result.jobId,
        durationMs: result.duration,
        status: result.status,
        successRate: `${successRate}%`,
        summary: result.summary,
      },
      outcome: {
        status:
          result.status === "failed"
            ? "failed"
            : result.summary.failedThreads > 0
              ? "partial"
              : "completed",
        successRate: `${successRate}%`,
      },
    });

    if (result.status === "failed") {
      status = 500;
    } else if (result.summary.failedThreads > 0) {
      status = 207;
    }

    return {
      bullmqJobId: job.id,
      duration: result.duration,
      jobId: result.jobId,
      status: result.status,
      successRate: `${successRate}%`,
      summary: result.summary,
      threadId,
      triggerKinds: triggers.map((trigger) => trigger.kind),
    };
  } catch (error) {
    if (status === 200) {
      status = 500;
    }
    requestLog.error(error instanceof Error ? error : String(error), {
      step: "thread.pipeline",
      retryable: status >= 500,
    });
    throw error;
  } finally {
    requestLog.emit({ status });
  }
};

// Create workers for each queue (autorun: false — started after collections are ready)
const threadPipelineWorker = new Worker<ThreadReadJobData>(
  THREAD_PIPELINE_QUEUE,
  handleThreadReadJob,
  {
    autorun: false,
    concurrency: 3, // Process up to 3 threads concurrently
    connection,
    removeOnComplete: {
      age: 24 * 3600, // 24 hours
      count: 100,
    },
    removeOnFail: {
      count: 1000,
    },
  }
);

const handleThreadReadTerminal = async (
  job: Job<ThreadReadJobData> | undefined,
  event: "completed" | "failed",
  error?: unknown
): Promise<void> => {
  if (!job) {
    return;
  }

  const maxAttempts = job.opts.attempts ?? 1;
  const terminal = event === "completed" || job.attemptsMade >= maxAttempts;
  if (!terminal) {
    emitQueueLifecycle({
      context: {
        followUp: { disposition: "deferred", reason: "retry_pending" },
      },
      event,
      job,
      operation: "thread.pipeline.follow_up",
      queue: THREAD_PIPELINE_QUEUE,
    });
    return;
  }

  try {
    const { threadId } = normalizeThreadReadJobData(job.data);
    const followUp = await drainPendingThreadRead(threadId);
    emitQueueLifecycle({
      context: {
        followUp: followUp ?? { disposition: "none" },
        thread: { id: threadId },
      },
      error,
      event,
      job,
      operation: "thread.pipeline.follow_up",
      queue: THREAD_PIPELINE_QUEUE,
    });
  } catch (drainError) {
    emitQueueLifecycle({
      context: {
        followUp: { disposition: "failed_to_drain" },
        thread: {
          id: normalizeThreadReadJobData(job.data).threadId,
        },
      },
      error: drainError,
      event: "failed",
      job,
      operation: "thread.pipeline.follow_up",
      queue: THREAD_PIPELINE_QUEUE,
    });
  }
};

threadPipelineWorker.on("completed", (job) => {
  void handleThreadReadTerminal(job, "completed");
});

threadPipelineWorker.on("failed", (job, error) => {
  void handleThreadReadTerminal(job, "failed", error);
});

// Event handler for infrastructure errors outside a job-scoped handler.
threadPipelineWorker.on("error", (err) => {
  emitQueueLifecycle({
    error: err,
    event: "error",
    operation: "thread.pipeline.worker",
    queue: THREAD_PIPELINE_QUEUE,
    status: 500,
  });
});

// Create crawl-documentation worker
const crawlDocWorker = new Worker(
  CRAWL_DOCUMENTATION_QUEUE,
  handleCrawlDocumentation,
  {
    autorun: false,
    concurrency: 2,
    connection,
    removeOnComplete: {
      age: 24 * 3600,
      count: 50,
    },
    removeOnFail: {
      count: 500,
    },
  }
);

crawlDocWorker.on("error", (err) => {
  emitQueueLifecycle({
    error: err,
    event: "error",
    operation: "documentation.crawl.worker",
    queue: CRAWL_DOCUMENTATION_QUEUE,
    status: 500,
  });
});

// Create PR embedding index worker (FRO-203). Index-only: keeps the PR vector
// index in step with the mirror; never fans out `pr_matched` reads.
const prIndexWorker = new Worker<PrIndexJobData>(
  PR_INDEX_QUEUE,
  handleIndexPr,
  {
    autorun: false,
    concurrency: 3,
    connection,
    removeOnComplete: {
      age: 24 * 3600,
      count: 100,
    },
    removeOnFail: {
      count: 500,
    },
  }
);

prIndexWorker.on("error", (err) => {
  emitQueueLifecycle({
    error: err,
    event: "error",
    operation: "pr.index.worker",
    queue: PR_INDEX_QUEUE,
    status: 500,
  });
});

// Create PR push-side match worker (FRO-205). Embeds an eligible PR, searches
// for similar Open / In-progress threads, and fans out `pr_matched` reads for
// the unlinked ones.
const prMatchWorker = new Worker<PrMatchJobData>(
  PR_MATCH_QUEUE,
  handleMatchPr,
  {
    autorun: false,
    concurrency: 3,
    connection,
    removeOnComplete: {
      age: 24 * 3600,
      count: 100,
    },
    removeOnFail: {
      count: 500,
    },
  }
);

prMatchWorker.on("error", (err) => {
  emitQueueLifecycle({
    error: err,
    event: "error",
    operation: "pr.match.worker",
    queue: PR_MATCH_QUEUE,
    status: 500,
  });
});

// Initialize and start
const initialize = async () => {
  const requestLog = createLogger({
    action: "worker.startup",
    queues: [
      THREAD_PIPELINE_QUEUE,
      CRAWL_DOCUMENTATION_QUEUE,
      PR_INDEX_QUEUE,
      PR_MATCH_QUEUE,
    ],
  });
  let status = 200;

  try {
    const processorNames = registerDefaultProcessors();
    requestLog.set({
      processors: {
        count: processorNames.length,
        names: processorNames,
      },
    });

    // Ensure Qdrant collections exist
    const [threadsReady, messagesReady, documentationReady, prsReady] =
      await Promise.all([
        ensureThreadsCollection(),
        ensureMessagesCollection(),
        ensureDocumentationCollection(),
        ensurePrsCollection(),
      ]);
    requestLog.set({
      qdrant: {
        collections: {
          threads: threadsReady,
          messages: messagesReady,
          documentation: documentationReady,
          pullRequests: prsReady,
        },
      },
    });
    if (!threadsReady || !messagesReady || !documentationReady || !prsReady) {
      throw new Error(
        "Qdrant collections are not ready; refusing to start workers"
      );
    }

    // Start workers now that collections are ready
    threadPipelineWorker.run();
    const recoveredPendingThreadReads = await recoverPendingThreadReads();
    crawlDocWorker.run();
    prIndexWorker.run();
    prMatchWorker.run();

    requestLog.set({
      outcome: {
        status: "listening",
        recoveredPendingThreadReads,
        workersStarted: 4,
      },
    });
  } catch (error) {
    status = 500;
    requestLog.error(error instanceof Error ? error : String(error), {
      step: "initialize_worker",
    });
    throw error;
  } finally {
    requestLog.emit({ status });
  }
};

// Graceful shutdown
const handleShutdown = async () => {
  const requestLog = createLogger({
    action: "worker.shutdown",
    queues: [
      THREAD_PIPELINE_QUEUE,
      CRAWL_DOCUMENTATION_QUEUE,
      PR_INDEX_QUEUE,
      PR_MATCH_QUEUE,
    ],
  });
  let status = 200;

  try {
    await Promise.all([
      threadPipelineWorker.close(),
      crawlDocWorker.close(),
      prIndexWorker.close(),
      prMatchWorker.close(),
    ]);
    await connection.quit();
    requestLog.set({ outcome: { status: "stopped", workersClosed: 4 } });
  } catch (error) {
    status = 500;
    requestLog.error(error instanceof Error ? error : String(error), {
      step: "shutdown_worker",
    });
    requestLog.set({ outcome: { status: "failed" } });
  } finally {
    requestLog.emit({ status });
    try {
      await flushSharedLogger();
    } catch (error) {
      process.stderr.write(
        `[worker.shutdown] log flush failed: ${JSON.stringify(errorFields(error))}\n`
      );
    }
  }
  process.exit(status === 200 ? 0 : 1);
};

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);

// Start the worker
initialize().catch((error) => {
  log.error({
    action: "worker.fatal",
    event: "initialization_failed",
    error: errorFields(error),
  });
  process.exit(1);
});
