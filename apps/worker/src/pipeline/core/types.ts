import type { Thread } from "../../types";

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
  reason: "idempotent" | "dependencies-skipped" | "dependencies-skipped-no-prior-run";
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
}

export interface ProcessorExecuteContext {
  context: import("./context").JobContext;
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

  execute(context: ProcessorExecuteContext): Promise<ProcessorResult<TOutput>>;
}

export interface TurnSummary {
  turnNumber: number;
  processors: string[];
  results: Array<{
    processor: string;
    threadResults: ProcessorResult[];
  }>;
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
