import { createHash } from "node:crypto";

import { createLogger } from "@workspace/utils/logging";
import { areWorkerJobsEnabled } from "api/feature-flag";

import { isRetryableError } from "../../lib/logging";
import type { WorkerLogger } from "../../lib/logging";
import { processorRegistry } from "../processors/registry";
import { createAgentRunAudit } from "./agent-run-audit";
import type { AgentRunAudit } from "./agent-run-audit";
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
import {
  collectRetryableProcessorFailures,
  RetryablePipelineError,
} from "./retry";
import { RunHydrationError, hydrateRunStates } from "./run-state";
import type { RunState } from "./run-state";
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

const processorResultForAudit = (result: ProcessorResult): ProcessorResult => {
  if (!("data" in result) || !result.data || typeof result.data !== "object") {
    return result;
  }

  const data = result.data as Record<string, unknown>;
  if (!Array.isArray(data.embedding)) {
    return result;
  }

  return {
    ...result,
    data: {
      ...data,
      // The vector itself is not useful for reconstructing a decision, but its
      // shape and hash let us prove which generated output was used.
      embedding: {
        dimensions: data.embedding.length,
        hash: createHash("sha256")
          .update(JSON.stringify(data.embedding))
          .digest("hex"),
      },
    },
  } as ProcessorResult;
};

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
    const run = context.runState(threadId);
    if (!run) {
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

    run.recordAudit(
      "processor.started",
      {
        dependencies,
        processor: processor.name,
      },
      { phase: "processor", processor: processor.name }
    );

    const execContext: ProcessorExecuteContext = {
      context,
      run,
      thread: run.thread,
      threadId,
    };

    if (
      dependencies.length > 0 &&
      context.wereAllProcessorsSkipped(dependencies, threadId) &&
      !processor.runsWhenDependenciesSkipped?.(execContext) &&
      !processor.runsOnTrigger?.(execContext)
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
      context.runState(threadId)?.recordAudit(
        "processor.skipped",
        {
          processor: processor.name,
          reason: keyExists
            ? "dependencies-skipped"
            : "dependencies-skipped-no-prior-run",
        },
        { phase: "processor", processor: processor.name }
      );
    }
  }

  const threadsToCheck: {
    threadId: string;
    key: string;
    hash: string;
    run: RunState;
  }[] = [];

  for (const threadId of threadsToCheckNormally) {
    const run = context.runState(threadId);
    if (!run) {
      continue;
    }

    const key = buildIdempotencyKey(processor.name, threadId);
    const hash = processor.computeHash({
      context,
      run,
      thread: run.thread,
      threadId,
    });

    threadsToCheck.push({ hash, key, run, threadId });
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
    run: RunState;
  }[] = [];

  for (const item of threadsToCheck) {
    const execContext: ProcessorExecuteContext = {
      context,
      run: item.run,
      thread: item.run.thread,
      threadId: item.threadId,
    };
    if (processor.runsOnTrigger?.(execContext)) {
      toProcess.push(item);
      continue;
    }
    const shouldSkip = shouldSkipMap.get(item.key);
    if (shouldSkip) {
      results.push({
        reason: "idempotent",
        skipped: true,
        success: true,
        threadId: item.threadId,
      });
      context.markProcessorSkipped(processor.name, item.threadId);
      item.run.recordAudit(
        "processor.skipped",
        { hash: item.hash, processor: processor.name, reason: "idempotent" },
        { phase: "processor", processor: processor.name }
      );
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
        run: item.run,
        thread: item.run.thread,
        threadId: item.threadId,
      };

      const processorStartedAt = performance.now();
      try {
        const result = await processor.execute(execContext);

        if (result.success && !result.skipped && result.data !== undefined) {
          context.setProcessorOutput(
            processor.name,
            item.threadId,
            result.data
          );
        }

        item.run.recordAudit(
          result.success ? "processor.completed" : "processor.failed",
          {
            hash: item.hash,
            processor: processor.name,
            result: processorResultForAudit(result),
            durationMs: performance.now() - processorStartedAt,
          },
          { phase: "processor", processor: processor.name }
        );

        return { hash: item.hash, key: item.key, result };
      } catch (error) {
        const retryable = isRetryableError(error);
        requestLog.error(error instanceof Error ? error : String(error), {
          processor: processor.name,
          threadId: item.threadId,
          retryable,
          step: "processor.execute",
        });
        item.run.recordAudit(
          "processor.failed",
          {
            error,
            hash: item.hash,
            processor: processor.name,
            retryable,
            durationMs: performance.now() - processorStartedAt,
          },
          { phase: "processor", processor: processor.name }
        );
        return {
          hash: item.hash,
          key: item.key,
          result: {
            error: error instanceof Error ? error.message : String(error),
            retryable,
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
      triggerKinds: input.triggers?.map((trigger) => trigger.kind),
      concurrency,
    },
    options,
  });
  let status = 200;
  let jobId: string | undefined;
  const audits = new Map<string, AgentRunAudit>();

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
    const hydratedRunStates = await hydrateRunStates(input.threadIds);
    const runStates = new Map(
      [...hydratedRunStates.entries()].filter(([, run]) =>
        areWorkerJobsEnabled(run.organizationId)
      )
    );
    const fetchTime = performance.now() - fetchStartTime;
    requestLog.set({
      fetch: {
        requestedCount: input.threadIds.length,
        fetchedCount: hydratedRunStates.size,
        missingCount: input.threadIds.length - hydratedRunStates.size,
        pipelineDisabledCount: hydratedRunStates.size - runStates.size,
        durationMs: fetchTime,
      },
    });

    if (runStates.size === 0) {
      status = hydratedRunStates.size === 0 ? 404 : 200;
      const skippedBecauseDisabled = hydratedRunStates.size > 0;
      const result: PipelineExecutionResult = {
        duration: performance.now() - startTime,
        jobId: pipelineJobId,
        status: "completed",
        summary: {
          completedProcessors: 0,
          failedThreads: skippedBecauseDisabled ? 0 : input.threadIds.length,
          processedThreads: 0,
          skippedThreads: skippedBecauseDisabled ? hydratedRunStates.size : 0,
          totalProcessors: 0,
          totalThreads: input.threadIds.length,
        },
        turns: [],
      };
      const persisted = await completePipelineJob(pipelineJobId, result);
      requestLog.set({
        persistence: { completed: persisted },
        outcome: {
          status: "completed",
          reason: skippedBecauseDisabled
            ? "pipeline_disabled"
            : "no_threads_found",
        },
      });
      return result;
    }

    const auditStart = input.audit;
    const effectiveTriggers = input.triggers ?? [];
    const normalizedTriggers =
      auditStart?.normalizedTriggers ?? effectiveTriggers;
    // Mixed supersede + synthesis jobs clear the previous read in the worker
    // preflight, before this pipeline gets its RunState. Preserve that
    // observable write in the same logical run's sequence.
    const supersedeClearedInPreflight =
      normalizedTriggers.some((trigger) => trigger.kind === "supersede") &&
      !effectiveTriggers.some((trigger) => trigger.kind === "supersede");

    await Promise.all(
      [...runStates.entries()].map(async ([threadId, run]) => {
        const audit = await createAgentRunAudit({
          attemptNumber: auditStart?.attemptNumber ?? 1,
          bullmqJobId: auditStart?.bullmqJobId,
          input,
          options,
          organizationId: run.organizationId,
          pipelineJobId,
          queueGeneration: auditStart?.queueGeneration,
          queueName: auditStart?.queueName,
          rawQueuePayload: auditStart?.rawQueuePayload,
          threadId,
        });
        run.attachAudit(audit);
        audits.set(threadId, audit);

        audit.record(
          "run.started",
          { pipelineJobId, threadId, triggers: effectiveTriggers },
          { phase: "run" }
        );
        audit.record(
          "trigger.received",
          {
            effectiveTriggers,
            normalizedTriggers,
            rawQueuePayload: auditStart?.rawQueuePayload ?? null,
          },
          { phase: "trigger" }
        );
        if (supersedeClearedInPreflight) {
          audit.record(
            "read.published",
            { reason: "supersede", read: null, source: "worker_preflight" },
            { phase: "supersede" }
          );
        }
      })
    );

    const context = new JobContext(pipelineJobId, input, options, runStates);

    const executionOrder = processorRegistry.resolveExecutionOrder();
    const totalProcessors = executionOrder.flat().length;
    requestLog.set({
      plan: {
        turnCount: executionOrder.length,
        processorCount: totalProcessors,
        turns: executionOrder,
      },
    });
    for (const [threadId, audit] of audits) {
      const run = runStates.get(threadId);
      audit.record(
        "pipeline.plan",
        { processorCount: totalProcessors, turns: executionOrder },
        { phase: "pipeline" }
      );
      audit.record(
        "context.captured",
        {
          hints: run?.hints() ?? {},
          options,
          thread: run?.thread ?? null,
          triggers: effectiveTriggers,
        },
        { phase: "context" }
      );
    }

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
    const enabledThreadIds = [...runStates.keys()];
    const pipelineDisabledCount = hydratedRunStates.size - runStates.size;
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
              threadResults: enabledThreadIds.map((threadId) => ({
                error: `Processor "${processorName}" not found`,
                success: false as const,
                threadId,
              })),
              stats: {
                successful: 0,
                skipped: 0,
                failed: enabledThreadIds.length,
              },
            };
          }

          const results = await executeProcessor(
            processor,
            context,
            enabledThreadIds,
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
    for (const threadId of enabledThreadIds) {
      if (!processedSet.has(threadId) && !failedSet.has(threadId)) {
        skippedSet.add(threadId);
      }
    }

    // Retryable processor failures must reject the outer job. Returning a
    // partial result would make BullMQ mark the job completed and skip retry.
    const retryableFailures = collectRetryableProcessorFailures(turns);
    if (retryableFailures.length > 0) {
      throw new RetryablePipelineError(retryableFailures);
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
        skippedThreads: skippedSet.size + pipelineDisabledCount,
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
        reason: error instanceof RunHydrationError ? "hydration" : "exception",
      },
    });

    // A run that couldn't be hydrated never started, and a retryable processor
    // failure needs BullMQ to run the job again. Both must reject rather than
    // resolve as a failed result. Every other failure here is a real run that
    // already recorded what it did, and keeps returning a result so partial
    // work isn't replayed.
    if (
      error instanceof RunHydrationError ||
      error instanceof RetryablePipelineError
    ) {
      throw error;
    }

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
    await Promise.all(
      [...audits.values()].map((audit) =>
        audit.complete(status >= 500 ? "failed" : "completed", {
          httpStatus: status,
          pipelineJobId: jobId ?? null,
        })
      )
    );
    requestLog.emit({ status });
  }
};
