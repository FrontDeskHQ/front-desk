import type { RunState } from "./run-state";
import type { PipelineJobInput, PipelineJobOptions } from "./types";

/**
 * JobContext implementation
 *
 * Bookkeeping for one job: processor outputs by name + threadId, which
 * processor+thread pairs were skipped, and the job's input and options. The
 * domain state each thread carries lives on its {@link RunState}, which this
 * holds rather than absorbs — outputs and skips are a different concern from
 * hints, policy and reads.
 */
export class JobContext {
  readonly jobId: string;
  readonly input: PipelineJobInput;
  readonly options: PipelineJobOptions;
  readonly runStates: Map<string, RunState>;

  /**
   * Storage for processor outputs
   * Key format: `${processorName}:${threadId}`
   */
  private processorOutputs = new Map<string, unknown>();

  /**
   * Tracks which processor+thread combinations were skipped (idempotent)
   * Key format: `${processorName}:${threadId}`
   */
  private skippedProcessors = new Set<string>();

  constructor(
    jobId: string,
    input: PipelineJobInput,
    options: PipelineJobOptions,
    runStates: Map<string, RunState>
  ) {
    this.jobId = jobId;
    this.input = input;
    this.options = options;
    this.runStates = runStates;
  }

  /** The run state for a thread, or undefined when it wasn't hydrated. */
  runState(threadId: string): RunState | undefined {
    return this.runStates.get(threadId);
  }

  /**
   * Build the storage key for a processor output
   */
  private static buildKey(processorName: string, threadId: string): string {
    return `${processorName}:${threadId}`;
  }

  /**
   * Get output from a specific processor for a specific thread
   */
  getProcessorOutput<T = unknown>(
    processorName: string,
    threadId: string
  ): T | undefined {
    const key = JobContext.buildKey(processorName, threadId);
    return this.processorOutputs.get(key) as T | undefined;
  }

  /**
   * Get all outputs from a specific processor
   */
  getAllProcessorOutputs<T = unknown>(processorName: string): Map<string, T> {
    const prefix = `${processorName}:`;
    const results = new Map<string, T>();

    for (const [key, value] of this.processorOutputs) {
      if (key.startsWith(prefix)) {
        const threadId = key.slice(prefix.length);
        results.set(threadId, value as T);
      }
    }

    return results;
  }

  /**
   * Set output for a processor and thread
   */
  setProcessorOutput<T = unknown>(
    processorName: string,
    threadId: string,
    data: T
  ): void {
    const key = JobContext.buildKey(processorName, threadId);
    this.processorOutputs.set(key, data);
  }

  /**
   * Check if a processor has output for a specific thread
   */
  hasProcessorOutput(processorName: string, threadId: string): boolean {
    const key = JobContext.buildKey(processorName, threadId);
    return this.processorOutputs.has(key);
  }

  /**
   * Get all processor output keys (for debugging)
   */
  getAllOutputKeys(): string[] {
    return [...this.processorOutputs.keys()];
  }

  /**
   * Mark a processor as skipped for a thread
   */
  markProcessorSkipped(processorName: string, threadId: string): void {
    const key = JobContext.buildKey(processorName, threadId);
    this.skippedProcessors.add(key);
  }

  /**
   * Check if a processor was skipped for a thread
   */
  wasProcessorSkipped(processorName: string, threadId: string): boolean {
    const key = JobContext.buildKey(processorName, threadId);
    return this.skippedProcessors.has(key);
  }

  /**
   * Check if all processors in a list were skipped for a thread
   */
  wereAllProcessorsSkipped(
    processorNames: string[],
    threadId: string
  ): boolean {
    if (processorNames.length === 0) {
      return false;
    }
    return processorNames.every((name) =>
      this.wasProcessorSkipped(name, threadId)
    );
  }
}
