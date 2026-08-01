import { createLogger } from "@workspace/utils/logging";
import type { Job } from "bullmq";

export type WorkerLogger = ReturnType<
  typeof createLogger<Record<string, unknown>>
>;

type JobLike = Pick<
  Job,
  | "attemptsMade"
  | "id"
  | "name"
  | "opts"
  | "processedOn"
  | "timestamp"
  | "finishedOn"
>;

const jobContext = (queue: string, job?: JobLike) => {
  if (!job) {
    return { queue };
  }

  const maxAttempts = job.opts.attempts ?? 1;
  return {
    job: {
      attempt: job.attemptsMade + 1,
      id: String(job.id ?? "unknown"),
      maxAttempts,
      name: job.name,
      priority: job.opts.priority ?? 0,
      ...(job.opts.delay ? { delayMs: job.opts.delay } : {}),
      queuedAt: new Date(job.timestamp).toISOString(),
      ...(job.processedOn
        ? { processedAt: new Date(job.processedOn).toISOString() }
        : {}),
      ...(job.finishedOn
        ? { finishedAt: new Date(job.finishedOn).toISOString() }
        : {}),
    },
    queue,
  };
};

/**
 * Build the single wide event used for one BullMQ job execution. Callers add
 * domain-specific fields with `set` and emit once in a finally block.
 */
export const createWorkerJobLogger = (
  queue: string,
  job: JobLike,
  operation: string,
  context: Record<string, unknown> = {}
): WorkerLogger =>
  createLogger({
    action: "worker.job",
    operation,
    ...jobContext(queue, job),
    ...context,
  });

/**
 * Emit a queue lifecycle event for cases where there is no handler-scoped
 * logger (BullMQ completion/failure/error events).
 */
export const emitQueueLifecycle = (options: {
  event: "completed" | "failed" | "error";
  error?: unknown;
  job?: JobLike;
  operation?: string;
  queue: string;
  status?: number;
  context?: Record<string, unknown>;
}): void => {
  const requestLog = createLogger({
    action: "worker.queue",
    event: options.event,
    operation: options.operation ?? "queue.lifecycle",
    ...jobContext(options.queue, options.job),
    ...options.context,
  });

  if (options.error !== undefined) {
    requestLog.error(toError(options.error), {
      step: `queue.${options.event}`,
    });
  }

  requestLog.emit({ status: options.status ?? (options.error ? 500 : 200) });
};

export const errorFields = (
  error: unknown
): {
  message: string;
  name: string;
  stack?: string;
} => ({
  message: error instanceof Error ? error.message : String(error),
  name: error instanceof Error ? error.name : "UnknownError",
  ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
});

export const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));
