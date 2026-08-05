import {
  closeThreadReadQueue,
  configureThreadReadQueue,
  createQueueRedisConnection,
  drainPendingThreadRead,
  recoverPendingThreadReads,
} from "@workspace/queue/thread-read";
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
import { Worker } from "bullmq";
import type { Job } from "bullmq";

import { handleCrawlDocumentation } from "./handlers/crawl-documentation";
import { handleIndexPr } from "./handlers/index-pr";
import { handleMatchPr } from "./handlers/match-pr";
import { clearThreadAgentRead } from "./lib/database/client";
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
const THREAD_READ_RECOVERY_INTERVAL_MS = 30_000;
const TERMINAL_DRAIN_RETRY_DELAYS_MS = [100, 250, 500];
let threadReadRecoveryRunning = false;
let threadReadRecoveryTimer: ReturnType<typeof setInterval> | undefined;

const recoverThreadReadFollowUps = async (): Promise<number> => {
  if (threadReadRecoveryRunning) {
    return 0;
  }
  threadReadRecoveryRunning = true;
  try {
    const results = await recoverPendingThreadReads();
    return results.filter(
      ({ disposition }) =>
        disposition === "scheduled" || disposition === "coalesced"
    ).length;
  } finally {
    threadReadRecoveryRunning = false;
  }
};

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

const connection = createQueueRedisConnection();
if (!connection) {
  throw new Error("Redis is not configured for the worker");
}
configureThreadReadQueue({ connection });

/**
 * Handler for thread-pipeline jobs
 * Runs the full thread pipeline for a single thread. Supersede causes clear the
 * current read first and bypass synthesis when no other cause was coalesced.
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
      triggers: triggers.map((trigger) => ({
        kind: trigger.kind,
        ...(trigger.prMatched
          ? {
              prMatched: {
                prId: trigger.prMatched.prId,
                score: trigger.prMatched.score,
              },
            }
          : {}),
      })),
    }
  );
  let status = 200;

  try {
    if (!threadId) {
      status = 400;
      throw new Error("No threadId provided");
    }

    const hasSupersede = triggers.some(
      (trigger) => trigger.kind === "supersede"
    );
    const synthesisTriggers = triggers.filter(
      (trigger) => trigger.kind !== "supersede"
    );
    const supersedeCleared = hasSupersede
      ? await clearThreadAgentRead(threadId)
      : undefined;

    if (synthesisTriggers.length === 0) {
      requestLog.set({
        outcome: supersedeCleared
          ? { status: "completed", reason: "superseded" }
          : { status: "skipped", reason: "thread_not_found" },
      });
      return {
        bullmqJobId: job.id,
        kind: "supersede",
        status: supersedeCleared ? "completed" : "skipped",
        threadId,
      };
    }

    const result = await executePipeline({
      threadIds: [threadId],
      triggers: synthesisTriggers,
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
      kinds: triggers.map((trigger) => trigger.kind),
      status: result.status,
      successRate: `${successRate}%`,
      summary: result.summary,
      threadId,
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

const drainTerminalFollowUp = async (
  job: Job<ThreadReadJobData>,
  terminalState: "completed" | "failed"
): Promise<void> => {
  let threadId: string;
  try {
    threadId = normalizeThreadReadJobData(job.data).threadId;
  } catch (error) {
    emitQueueLifecycle({
      error: error instanceof Error ? error : new Error(String(error)),
      event: terminalState,
      operation: "thread.pipeline.follow_up.parse",
      queue: THREAD_PIPELINE_QUEUE,
      status: 500,
    });
    return;
  }

  const attemptDrain = async (attempt: number): Promise<void> => {
    try {
      await drainPendingThreadRead(threadId);
    } catch (error) {
      const delay = TERMINAL_DRAIN_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        emitQueueLifecycle({
          error: error instanceof Error ? error : new Error(String(error)),
          event: terminalState,
          operation: "thread.pipeline.follow_up.drain",
          queue: THREAD_PIPELINE_QUEUE,
          status: 500,
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      await attemptDrain(attempt + 1);
    }
  };

  await attemptDrain(0);
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

threadPipelineWorker.on("completed", (job) => {
  void drainTerminalFollowUp(job, "completed");
});

threadPipelineWorker.on("failed", (job) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    void drainTerminalFollowUp(job, "failed");
  }
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

    // Recover persisted follow-ups before accepting new thread reads. A
    // non-overlapping scan below keeps retrying records that were active or
    // temporarily unavailable during startup.
    let recoveredThreadReads = 0;
    try {
      recoveredThreadReads = await recoverThreadReadFollowUps();
    } catch (error) {
      emitQueueLifecycle({
        error: error instanceof Error ? error : new Error(String(error)),
        event: "error",
        operation: "thread.pipeline.recovery.startup",
        queue: THREAD_PIPELINE_QUEUE,
        status: 500,
      });
    }
    requestLog.set({
      recovery: { recoveredThreadReads },
    });

    // Start workers now that collections and durable recovery are ready.
    threadPipelineWorker.run();
    crawlDocWorker.run();
    prIndexWorker.run();
    prMatchWorker.run();

    threadReadRecoveryTimer = setInterval(() => {
      void recoverThreadReadFollowUps().catch((error) => {
        emitQueueLifecycle({
          error: error instanceof Error ? error : new Error(String(error)),
          event: "error",
          operation: "thread.pipeline.recovery",
          queue: THREAD_PIPELINE_QUEUE,
          status: 500,
        });
      });
    }, THREAD_READ_RECOVERY_INTERVAL_MS);
    threadReadRecoveryTimer.unref();

    requestLog.set({
      outcome: {
        status: "listening",
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
    if (threadReadRecoveryTimer) {
      clearInterval(threadReadRecoveryTimer);
      threadReadRecoveryTimer = undefined;
    }
    await Promise.all([
      threadPipelineWorker.close(),
      crawlDocWorker.close(),
      prIndexWorker.close(),
      prMatchWorker.close(),
    ]);
    await closeThreadReadQueue();
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
