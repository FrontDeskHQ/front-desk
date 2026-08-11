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

  const maxAttempts = job.opts.attempts || 1;
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

  requestLog.emit({
    status: options.status ?? (options.error !== undefined ? 500 : 200),
  });
};

interface StructuredError {
  code?: unknown;
  details?: unknown;
  message?: unknown;
  name?: unknown;
  stack?: unknown;
}

const getStructuredError = (error: unknown): StructuredError | undefined =>
  typeof error === "object" && error !== null
    ? (error as StructuredError)
    : undefined;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  const structuredError = getStructuredError(error);
  if (typeof structuredError?.message === "string") {
    return structuredError.message;
  }

  return String(error);
};

export const errorFields = (
  error: unknown
): {
  code?: string;
  details?: unknown;
  message: string;
  name: string;
  stack?: string;
} => {
  const structuredError = getStructuredError(error);
  const code =
    typeof structuredError?.code === "string"
      ? structuredError.code
      : undefined;
  const name =
    error instanceof Error
      ? error.name
      : typeof structuredError?.name === "string"
        ? structuredError.name
        : "UnknownError";
  const stack =
    error instanceof Error
      ? error.stack
      : typeof structuredError?.stack === "string"
        ? structuredError.stack
        : undefined;

  return {
    ...(code ? { code } : {}),
    ...(structuredError?.details !== undefined
      ? { details: structuredError.details }
      : {}),
    message: getErrorMessage(error),
    name,
    ...(stack ? { stack } : {}),
  };
};

export const isRetryableError = (error: unknown): boolean => {
  const structuredError = getStructuredError(error);
  const errorName =
    error instanceof Error
      ? error.constructor.name
      : typeof structuredError?.name === "string"
        ? structuredError.name
        : "";
  const message = getErrorMessage(error).toLowerCase();

  return (
    errorName.includes("RetryError") ||
    errorName.includes("NoObjectGeneratedError") ||
    errorName === "SynthesisOutputParseError" ||
    errorName.includes("APIError") ||
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("connection") ||
    message.includes("overloaded") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("quota") ||
    message.includes("429")
  );
};

export const sanitizeUrl = (value: string): string => {
  try {
    const url = new URL(value);
    const authority = url.host ? `//${url.host}` : "";
    return `${url.protocol}${authority}${url.pathname}`;
  } catch {
    const withoutQuery = value.split(/[?#]/, 1)[0] ?? "[invalid-url]";
    return withoutQuery.replace(/\/\/[^/]*@/, "//[REDACTED]@");
  }
};

export const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(getErrorMessage(error));
