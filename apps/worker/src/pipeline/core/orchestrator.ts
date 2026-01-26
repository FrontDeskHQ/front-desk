import { fetchThreadsWithRelations } from "../../lib/database/client";
import type { Thread } from "../../types";
import { processorRegistry } from "../processors/registry";
import { JobContext } from "./context";
import {
  batchCheckIdempotency,
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
  concurrency: number,
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
): Promise<ProcessorResult[]> => {
  const threadsToCheck: Array<{
    threadId: string;
    key: string;
    hash: string;
    thread: Thread;
  }> = [];

  for (const threadId of threadIds) {
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

    threadsToCheck.push({ threadId, key, hash, thread });
  }

  const shouldSkipMap = await batchCheckIdempotency(
    threadsToCheck.map(({ key, hash }) => ({ key, hash })),
  );

  const toProcess: Array<{
    threadId: string;
    key: string;
    hash: string;
    thread: Thread;
  }> = [];
  const results: ProcessorResult[] = [];

  for (const item of threadsToCheck) {
    const shouldSkip = shouldSkipMap.get(item.key);
    if (shouldSkip) {
      results.push({
        threadId: item.threadId,
        success: true,
        skipped: true,
        reason: "idempotent",
      });
    } else {
      toProcess.push(item);
    }
  }

  const foundThreadIds = new Set(threadsToCheck.map((t) => t.threadId));
  for (const threadId of threadIds) {
    if (!foundThreadIds.has(threadId)) {
      results.push({
        threadId,
        success: false,
        error: "Thread not found in context",
      });
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
            result.data,
          );
        }

        return { result, key: item.key, hash: item.hash };
      } catch (error) {
        console.error(
          `Processor ${processor.name} threw for thread ${item.threadId}:`,
          error,
        );
        return {
          result: {
            threadId: item.threadId,
            success: false as const,
            error: error instanceof Error ? error.message : String(error),
          },
          key: item.key,
          hash: item.hash,
        };
      }
    },
    concurrency,
  );

  const successfulKeys: Array<{ key: string; hash: string }> = [];

  for (const { result, key, hash } of processedResults) {
    results.push(result);
    if (result.success && !result.skipped) {
      successfulKeys.push({ key, hash });
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
  options: PipelineJobOptions = {},
): Promise<PipelineExecutionResult> => {
  const startTime = performance.now();
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  console.log("=".repeat(72));
  console.log(
    `Pipeline Execution - Processing ${input.threadIds.length} threads`,
  );
  console.log("=".repeat(72));

  const jobId = await createPipelineJob(input.threadIds, options);
  console.log(`\n[Setup] Created pipeline job: ${jobId}`);

  await updatePipelineJobStatus(jobId, "running");

  try {
    console.log("\n[Step 1] Fetching thread data...");
    const fetchStartTime = performance.now();
    const threads = await fetchThreadsWithRelations(input.threadIds);
    const fetchTime = performance.now() - fetchStartTime;
    console.log(
      `  Fetched ${threads.size}/${input.threadIds.length} threads in ${(fetchTime / 1000).toFixed(2)}s`,
    );

    if (threads.size === 0) {
      const result: PipelineExecutionResult = {
        jobId,
        status: "completed",
        turns: [],
        summary: {
          totalThreads: input.threadIds.length,
          processedThreads: 0,
          skippedThreads: 0,
          failedThreads: input.threadIds.length,
          totalProcessors: 0,
          completedProcessors: 0,
        },
        duration: performance.now() - startTime,
      };
      await completePipelineJob(jobId, result);
      return result;
    }

    const context = new JobContext(jobId, input, options, threads);

    console.log("\n[Step 2] Resolving processor execution order...");
    const executionOrder = processorRegistry.resolveExecutionOrder();
    const totalProcessors = executionOrder.flat().length;
    console.log(
      `  Execution plan: ${executionOrder.length} turns, ${totalProcessors} processors`,
    );
    for (let i = 0; i < executionOrder.length; i++) {
      const turn = executionOrder[i];
      if (turn) {
        console.log(`    Turn ${i + 1}: ${turn.join(", ")}`);
      }
    }

    const turns: TurnSummary[] = [];
    const threadIds = Array.from(threads.keys());
    let completedProcessors = 0;

    for (let turnIndex = 0; turnIndex < executionOrder.length; turnIndex++) {
      const turnProcessors = executionOrder[turnIndex];
      if (!turnProcessors) continue;

      const turnNumber = turnIndex + 1;
      const turnStartTime = performance.now();

      console.log(
        `\n[Turn ${turnNumber}/${executionOrder.length}] Running: ${turnProcessors.join(", ")}`,
      );

      const turnResults = await Promise.all(
        turnProcessors.map(async (processorName) => {
          const processor = processorRegistry.get(processorName);
          if (!processor) {
            console.error(`Processor "${processorName}" not found in registry`);
            return {
              processor: processorName,
              threadResults: threadIds.map((threadId) => ({
                threadId,
                success: false as const,
                error: `Processor "${processorName}" not found`,
              })),
            };
          }

          console.log(`  - Starting processor: ${processorName}`);
          const results = await executeProcessor(
            processor,
            context,
            threadIds,
            concurrency,
          );

          const successful = results.filter(
            (r) => r.success && !r.skipped,
          ).length;
          const skipped = results.filter((r) => r.success && r.skipped).length;
          const failed = results.filter((r) => !r.success).length;

          console.log(
            `    ${processorName}: ${successful} processed, ${skipped} skipped, ${failed} failed`,
          );

          completedProcessors++;
          return {
            processor: processorName,
            threadResults: results,
          };
        }),
      );

      const turnDuration = performance.now() - turnStartTime;

      turns.push({
        turnNumber,
        processors: turnProcessors,
        results: turnResults,
        duration: turnDuration,
      });

      console.log(
        `  Turn ${turnNumber} completed in ${(turnDuration / 1000).toFixed(2)}s`,
      );
    }

    const processedSet = new Set<string>();
    const skippedSet = new Set<string>();
    const failedSet = new Set<string>();

    // Look at the last turn's results to determine final status per thread
    // A thread is "processed" if any processor successfully processed it
    // A thread is "skipped" if all processors skipped it
    // A thread is "failed" if it never succeeded

    for (const turn of turns) {
      for (const { threadResults } of turn.results) {
        for (const result of threadResults) {
          if (result.success && !result.skipped) {
            processedSet.add(result.threadId);
            skippedSet.delete(result.threadId);
            failedSet.delete(result.threadId);
          } else if (result.success && result.skipped) {
            if (!processedSet.has(result.threadId)) {
              skippedSet.add(result.threadId);
            }
          } else if (!result.success) {
            if (
              !processedSet.has(result.threadId) &&
              !skippedSet.has(result.threadId)
            ) {
              failedSet.add(result.threadId);
            }
          }
        }
      }
    }

    const totalDuration = performance.now() - startTime;

    const result: PipelineExecutionResult = {
      jobId,
      status: "completed",
      turns,
      summary: {
        totalThreads: input.threadIds.length,
        processedThreads: processedSet.size,
        skippedThreads: skippedSet.size,
        failedThreads: failedSet.size,
        totalProcessors,
        completedProcessors,
      },
      duration: totalDuration,
    };

    await completePipelineJob(jobId, result);

    console.log("\n" + "=".repeat(72));
    console.log("Pipeline Complete");
    console.log("=".repeat(72));
    console.log(`  Job ID: ${jobId}`);
    console.log(`  Total threads: ${result.summary.totalThreads}`);
    console.log(`  Processed: ${result.summary.processedThreads}`);
    console.log(`  Skipped (idempotent): ${result.summary.skippedThreads}`);
    console.log(`  Failed: ${result.summary.failedThreads}`);
    console.log(
      `  Processors: ${result.summary.completedProcessors}/${result.summary.totalProcessors}`,
    );
    console.log(`  Total duration: ${(totalDuration / 1000).toFixed(2)}s`);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("\nPipeline execution failed:", errorMessage);

    await failPipelineJob(jobId, errorMessage);

    const totalDuration = performance.now() - startTime;

    return {
      jobId,
      status: "failed",
      turns: [],
      summary: {
        totalThreads: input.threadIds.length,
        processedThreads: 0,
        skippedThreads: 0,
        failedThreads: input.threadIds.length,
        totalProcessors: 0,
        completedProcessors: 0,
      },
      duration: totalDuration,
    };
  }
};
