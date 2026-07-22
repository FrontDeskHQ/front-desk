import type { ThreadReadTrigger } from "@workspace/schemas/signals";

import type { Thread } from "../../types";
import type { JobContext } from "./context";

export interface ProcessorSuccessResult<T = unknown> {
  threadId: string;
  success: true;
  data: T;
  skipped?: false;
}

export interface ProcessorErrorResult {
  threadId: string;
  success: false;
  error: string;
  skipped?: false;
}

export interface ProcessorSkippedResult {
  threadId: string;
  success: true;
  skipped: true;
  reason:
    | "idempotent"
    | "dependencies-skipped"
    | "dependencies-skipped-no-prior-run";
}

export type ProcessorResult<T = unknown> =
  | ProcessorSuccessResult<T>
  | ProcessorErrorResult
  | ProcessorSkippedResult;

export interface PipelineJobOptions {
  concurrency?: number;
  similarThreadsLimit?: number;
  scoreThreshold?: number;
}

export interface PipelineJobInput {
  threadIds: string[];
  /**
   * Why this run was triggered and any payload it pushed (ADR 0006). Carried
   * on a channel separate from `hints` so synthesis can weight a push-side
   * `pr_matched` candidate distinctly from pull-side hint evidence. Batch-level
   * because the worker enqueues one thread per job.
   */
  trigger?: ThreadReadTrigger;
}

export interface ProcessorExecuteContext {
  context: JobContext;
  thread: Thread;
  threadId: string;
}

export interface ProcessorDefinition<TOutput = unknown> {
  name: string;
  dependencies: string[];

  getIdempotencyKey(threadId: string): string;

  /**
   * Hash should change when the input data changes, triggering reprocessing
   */
  computeHash(context: ProcessorExecuteContext): string;

  /**
   * When all of a processor's dependencies were skipped, the orchestrator
   * fast-paths this processor to "skipped" on idempotency-key existence alone,
   * without consulting {@link computeHash}. That assumes a processor's output is
   * a pure function of its declared dependencies. Return `true` here to opt out
   * and route the thread through the normal hash-based check instead — required
   * when the processor also reads thread state outside its declared deps (e.g.
   * `related_prs` must clear its hint once `externalPrId` is set, even though
   * linking a PR does not change the embedding its `embed` dependency produces).
   */
  runsWhenDependenciesSkipped?(context: ProcessorExecuteContext): boolean;

  execute(context: ProcessorExecuteContext): Promise<ProcessorResult<TOutput>>;
}

export interface TurnSummary {
  turnNumber: number;
  processors: string[];
  results: {
    processor: string;
    threadResults: ProcessorResult[];
  }[];
  duration: number;
}

export type PipelineStatus = "pending" | "running" | "completed" | "failed";

export interface PipelineExecutionResult {
  jobId: string;
  status: PipelineStatus;
  turns: TurnSummary[];
  summary: {
    totalThreads: number;
    processedThreads: number;
    skippedThreads: number;
    failedThreads: number;
    totalProcessors: number;
    completedProcessors: number;
  };
  duration: number;
}

export interface PipelineJobMetadata {
  threadIds: string[];
  options?: PipelineJobOptions;
  turns?: TurnSummary[];
  summary?: PipelineExecutionResult["summary"];
  error?: string;
}
