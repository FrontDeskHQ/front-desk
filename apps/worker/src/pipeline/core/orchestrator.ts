import { createLogger } from "@workspace/utils/logging";

import { fetchThreadsWithRelations } from "../../lib/database/client";
import type { WorkerLogger } from "../../lib/logging";
import type { Thread } from "../../types";
import { processorRegistry } from "../processors/registry";
import { JobContext } from "./context";
import {
  batchCheckIdempotency,
  batchCheckIdempotencyKeyExists,
  batchStoreIdempotencyKeys,
  buildIdempotencyKey,
} from "./idempotency";
import {
  completePipelineJob,
  createPipelineJob,
  failPipelineJob,
  updatePipelineJobStatus,
} from "./persistence";
import type {
  PipelineExecutionResult,
  PipelineJobInput,
  PipelineJobOptions,
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
  TurnSummary,
} from "./types";

const DEFAULT_CONCURRENCY = 5;

/**
 * Process a batch of threads with controlled concurrency
 */
const processBatchWithConcurrency = async <T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> => {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }

  return results;
};

/**
 * Execute a single processor for all threads
 */
const executeProcessor = async (
  processor: ProcessorDefinition,
  context: JobContext,
  threadIds: string[],
  concurrency: number,
  requestLog: WorkerLogger
): Promise<ProcessorResult[]> => {
  const results: ProcessorResult[] = [];
  const dependencies = processor.dependencies ?? [];

  // First, identify threads where all dependencies were skipped
  // These threads need special handling - they should skip if we've run before
  const threadsWithAllDepsSkipped: string[] = [];
  const threadsToCheckNormally: string[] = [];

  for (const threadId of threadIds) {
    const thread = context.threads.get(threadId);
    if (!thread) {
      requestLog.warn("Requested thread was not returned by the database", {
        processor: processor.name,
        threadId,
        step: "load_thread",
      });
      results.push({
        error: "Thread not found in context",
        success: false,
        threadId,
      });
      continue;
    }

    if (
      dependencies.length > 0 &&
      context.wereAllProcessorsSkipped(dependencies, threadId) &&
      !processor.runsWhenDependenciesSkipped?.({ context, thread, threadId })
    ) {
      threadsWithAllDepsSkipped.push(threadId);
    } else {
      threadsToCheckNormally.push(threadId);
    }
  }

  if (threadsWithAllDepsSkipped.length > 0) {
    const keysToCheck = threadsWithAllDepsSkipped.map((threadId) =>
      buildIdempotencyKey(processor.name, threadId)
    );

    const keyExistsMap = await batchCheckIdempotencyKeyExists(keysToCheck);

    for (const threadId of threadsWithAllDepsSkipped) {
      const key = buildIdempotencyKey(processor.name, threadId);
      const keyExists = keyExistsMap.get(key);

      if (!keyExists) {
        requestLog.warn(
          "Processor dependencies were skipped without a prior run",
          {
            processor: processor.name,
            threadId,
            step: "dependency_skip",
          }
        );
      }

      results.push({
        reason: keyExists
          ? "dependencies-skipped"
          : "dependencies-skipped-no-prior-run",
        skipped: true,
        success: true,
        threadId,
      });
      context.markProcessorSkipped(processor.name, threadId);
    }
  }

  const threadsToCheck: {
    threadId: string;
    key: string;
    hash: string;
    thread: Thread;
  }[] = [];

  for (const threadId of threadsToCheckNormally) {
    const thread = context.threads.get(threadId);
    if (!thread) {
      continue;
    }

    const key = buildIdempotencyKey(processor.name, threadId);
    const execContext: ProcessorExecuteContext = {
      context,
      thread,
      threadId,
    };
    const hash = processor.computeHash(execContext);

    threadsToCheck.push({ hash, key, thread, threadId });
  }

  if (threadsToCheck.length === 0) {
    return results;
  }

  const shouldSkipMap = await batchCheckIdempotency(
    threadsToCheck.map(({ key, hash }) => ({ hash, key }))
  );

  const toProcess: {
    threadId: string;
    key: string;
    hash: string;
    thread: Thread;
  }[] = [];

  for (const item of threadsToCheck) {
    const shouldSkip = shouldSkipMap.get(item.key);
    if (shouldSkip) {
      results.push({
        reason: "idempotent",
        skipped: true,
        success: true,
        threadId: item.threadId,
      });
      context.markProcessorSkipped(processor.name, item.threadId);
    } else {
      toProcess.push(item);
    }
  }

  if (toProcess.length === 0) {
    return results;
  }

  const processedResults = await processBatchWithConcurrency(
    toProcess,
    async (item) => {
      const execContext: ProcessorExecuteContext = {
        context,
        thread: item.thread,
        threadId: item.threadId,
      };

      try {
        const result = await processor.execute(execContext);

        if (result.success && !result.skipped && result.data !== undefined) {
          context.setProcessorOutput(
            processor.name,
            item.threadId,
            result.data
          );
        }

        return { hash: item.hash, key: item.key, result };
      } catch (error) {
        requestLog.error(error instanceof Error ? error : String(error), {
          processor: processor.name,
          threadId: item.threadId,
          retryable: true,
          step: "processor.execute",
        });
        return {
          hash: item.hash,
          key: item.key,
          result: {
            error: error instanceof Error ? error.message : String(error),
            success: false as const,
            threadId: item.threadId,
          },
        };
      }
    },
    concurrency
  );

  const successfulKeys: { key: string; hash: string }[] = [];

  for (const { result, key, hash } of processedResults) {
    results.push(result);
    if (result.success && !result.skipped) {
      successfulKeys.push({ hash, key });
    }
  }

  if (successfulKeys.length > 0) {
    await batchStoreIdempotencyKeys(successfulKeys);
  }

  return results;
};

/**
 * Execute the pipeline for a batch of threads
 */
export const executePipeline = async (
  input: PipelineJobInput,
  options: PipelineJobOptions = {}
): Promise<PipelineExecutionResult> => {
  const startTime = performance.now();
  const concurrency =
    options.concurrency && options.concurrency > 0
      ? options.concurrency
      : DEFAULT_CONCURRENCY;
  const requestLog = createLogger({
    action: "worker.thread_pipeline",
    operation: "pipeline.execute",
    input: {
      requestedThreadCount: input.threadIds.length,
      threadIds: input.threadIds,
      triggerKinds: input.triggers?.map((trigger) => trigger.kind) ?? [],
      concurrency,
    },
    options,
  });
  let status = 200;
  let jobId: string | undefined;

  try {
    const pipelineJobId = await createPipelineJob(input.threadIds, options);
    jobId = pipelineJobId;
    requestLog.set({ pipeline: { jobId: pipelineJobId, state: "created" } });

    const markedRunning = await updatePipelineJobStatus(
      pipelineJobId,
      "running"
    );
    requestLog.set({ persistence: { markedRunning } });

    const fetchStartTime = performance.now();
    const threads = await fetchThreadsWithRelations(input.threadIds);
    const fetchTime = performance.now() - fetchStartTime;
    requestLog.set({
      fetch: {
        requestedCount: input.threadIds.length,
        fetchedCount: threads.size,
        missingCount: input.threadIds.length - threads.size,
        durationMs: fetchTime,
      },
    });

    if (threads.size === 0) {
      status = 404;
      const result: PipelineExecutionResult = {
        duration: performance.now() - startTime,
        jobId: pipelineJobId,
        status: "completed",
        summary: {
          completedProcessors: 0,
          failedThreads: input.threadIds.length,
          processedThreads: 0,
          skippedThreads: 0,
          totalProcessors: 0,
          totalThreads: input.threadIds.length,
        },
        turns: [],
      };
      const persisted = await completePipelineJob(pipelineJobId, result);
      requestLog.set({
        persistence: { completed: persisted },
        outcome: { status: "completed", reason: "no_threads_found" },
      });
      return result;
    }

    const context = new JobContext(pipelineJobId, input, options, threads);

    const executionOrder = processorRegistry.resolveExecutionOrder();
    const totalProcessors = executionOrder.flat().length;
    requestLog.set({
      plan: {
        turnCount: executionOrder.length,
        processorCount: totalProcessors,
        turns: executionOrder,
      },
    });

    const turns: TurnSummary[] = [];
    const turnLogSummaries: {
      durationMs: number;
      processorStats: {
        failed: number;
        processor: string;
        skipped: number;
        successful: number;
      }[];
      processors: string[];
      turnNumber: number;
    }[] = [];
    const requestedThreadIds = input.threadIds;
    let completedProcessors = 0;

    for (let turnIndex = 0; turnIndex < executionOrder.length; turnIndex++) {
      const turnProcessors = executionOrder[turnIndex];
      if (!turnProcessors) {
        continue;
      }

      const turnNumber = turnIndex + 1;
      const turnStartTime = performance.now();

      const turnResults = await Promise.all(
        turnProcessors.map(async (processorName) => {
          const processor = processorRegistry.get(processorName);
          if (!processor) {
            requestLog.error(
              new Error(`Processor "${processorName}" not found in registry`),
              {
                processor: processorName,
                step: "resolve_processor",
              }
            );
            return {
              processor: processorName,
              threadResults: requestedThreadIds.map((threadId) => ({
                error: `Processor "${processorName}" not found`,
                success: false as const,
                threadId,
              })),
              stats: {
                successful: 0,
                skipped: 0,
                failed: requestedThreadIds.length,
              },
            };
          }

          const results = await executeProcessor(
            processor,
            context,
            requestedThreadIds,
            concurrency,
            requestLog
          );

          const successful = results.filter(
            (r) => r.success && !r.skipped
          ).length;
          const skipped = results.filter((r) => r.success && r.skipped).length;
          const failed = results.filter((r) => !r.success).length;

          return {
            processor: processorName,
            threadResults: results,
            stats: { successful, skipped, failed },
          };
        })
      );

      completedProcessors += turnProcessors.length;

      const turnDuration = performance.now() - turnStartTime;

      turns.push({
        duration: turnDuration,
        processors: turnProcessors,
        results: turnResults,
        turnNumber,
      });

      turnLogSummaries.push({
        turnNumber,
        processors: turnProcessors,
        durationMs: turnDuration,
        processorStats: turnResults.map((turnResult) => ({
          processor: turnResult.processor,
          ...turnResult.stats,
        })),
      });
    }

    requestLog.set({ turns: turnLogSummaries });

    const processedSet = new Set<string>();
    const failedSet = new Set<string>();

    // Count operations (processor-thread combinations)
    let processedOps = 0;
    let skippedOps = 0;
    let failedOps = 0;

    for (const turn of turns) {
      for (const { threadResults } of turn.results) {
        for (const result of threadResults) {
          if (result.success && !result.skipped) {
            processedSet.add(result.threadId);
            processedOps++;
          } else if (result.success && result.skipped) {
            skippedOps++;
          } else if (!result.success) {
            failedSet.add(result.threadId);
            failedOps++;
          }
        }
      }
    }

    const skippedSet = new Set<string>();
    for (const threadId of requestedThreadIds) {
      if (!processedSet.has(threadId) && !failedSet.has(threadId)) {
        skippedSet.add(threadId);
      }
    }

    const totalDuration = performance.now() - startTime;

    const result: PipelineExecutionResult = {
      duration: totalDuration,
      jobId: pipelineJobId,
      status: "completed",
      summary: {
        completedProcessors,
        failedThreads: failedSet.size,
        processedThreads: processedSet.size,
        skippedThreads: skippedSet.size,
        totalProcessors,
        totalThreads: input.threadIds.length,
      },
      turns,
    };

    const persisted = await completePipelineJob(pipelineJobId, result);
    requestLog.set({
      persistence: { completed: persisted },
      outcome: {
        status: result.summary.failedThreads > 0 ? "partial" : "completed",
        durationMs: totalDuration,
        operations: {
          processed: processedOps,
          skipped: skippedOps,
          failed: failedOps,
        },
        summary: result.summary,
      },
    });

    if (result.summary.failedThreads > 0) {
      status = 207;
    }

    return result;
  } catch (error) {
    status = 500;
    const errorMessage = error instanceof Error ? error.message : String(error);
    requestLog.error(error instanceof Error ? error : String(error), {
      retryable: true,
      step: "pipeline.execute",
    });

    const persisted = jobId
      ? await failPipelineJob(jobId, errorMessage)
      : false;
    requestLog.set({
      persistence: { failed: persisted },
      outcome: {
        status: "failed",
        durationMs: performance.now() - startTime,
        reason: "exception",
      },
    });

    const totalDuration = performance.now() - startTime;

    return {
      duration: totalDuration,
      jobId: jobId ?? "unknown",
      status: "failed",
      summary: {
        completedProcessors: 0,
        failedThreads: input.threadIds.length,
        processedThreads: 0,
        skippedThreads: 0,
        totalProcessors: 0,
        totalThreads: input.threadIds.length,
      },
      turns: [],
    };
  } finally {
    requestLog.emit({ status });
  }
};
