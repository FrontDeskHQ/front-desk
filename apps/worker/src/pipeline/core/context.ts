import type { Thread } from "../../types";
import type { PipelineJobInput, PipelineJobOptions } from "./types";

/**
 * JobContext implementation
 *
 * Stores processor outputs by name + threadId and provides
 * access to job input, options, and thread data.
 */
export class JobContext {
  readonly jobId: string;
  readonly input: PipelineJobInput;
  readonly options: PipelineJobOptions;
  readonly threads: Map<string, Thread>;

  /**
   * Storage for processor outputs
   * Key format: `${processorName}:${threadId}`
   */
  private processorOutputs: Map<string, unknown> = new Map();

  /**
   * Tracks which processor+thread combinations were skipped (idempotent)
   * Key format: `${processorName}:${threadId}`
   */
  private skippedProcessors: Set<string> = new Set();

  constructor(
    jobId: string,
    input: PipelineJobInput,
    options: PipelineJobOptions,
    threads: Map<string, Thread>,
  ) {
    this.jobId = jobId;
    this.input = input;
    this.options = options;
    this.threads = threads;
  }

  /**
   * Build the storage key for a processor output
   */
  private buildKey(processorName: string, threadId: string): string {
    return `${processorName}:${threadId}`;
  }

  /**
   * Get output from a specific processor for a specific thread
   */
  getProcessorOutput<T = unknown>(
    processorName: string,
    threadId: string,
  ): T | undefined {
    const key = this.buildKey(processorName, threadId);
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
    data: T,
  ): void {
    const key = this.buildKey(processorName, threadId);
    this.processorOutputs.set(key, data);
  }

  /**
   * Check if a processor has output for a specific thread
   */
  hasProcessorOutput(processorName: string, threadId: string): boolean {
    const key = this.buildKey(processorName, threadId);
    return this.processorOutputs.has(key);
  }

  /**
   * Get all processor output keys (for debugging)
   */
  getAllOutputKeys(): string[] {
    return Array.from(this.processorOutputs.keys());
  }

  /**
   * Mark a processor as skipped for a thread
   */
  markProcessorSkipped(processorName: string, threadId: string): void {
    const key = this.buildKey(processorName, threadId);
    this.skippedProcessors.add(key);
  }

  /**
   * Check if a processor was skipped for a thread
   */
  wasProcessorSkipped(processorName: string, threadId: string): boolean {
    const key = this.buildKey(processorName, threadId);
    return this.skippedProcessors.has(key);
  }

  /**
   * Check if all processors in a list were skipped for a thread
   */
  wereAllProcessorsSkipped(processorNames: string[], threadId: string): boolean {
    if (processorNames.length === 0) {
      return false;
    }
    return processorNames.every((name) => this.wasProcessorSkipped(name, threadId));
  }
}
