import {
  isPublicError,
  type JsonValue,
  PublicError,
  type SerializedPublicError,
  serializePublicError,
} from "@live-state/sync";

/**
 * Canonical error codes exposed to clients, each tied to one HTTP status.
 * Keep this set small: `code` answers "what class of failure is this?" and
 * drives generic client handling (retry, re-auth, show a message). The
 * specific cause lives in `details.reason`.
 */
export const ERROR_STATUS = {
  BAD_REQUEST: 400,
  /** Emitted by live-state when procedure input fails schema validation. */
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  /** The request is valid, but the resource or workspace is not in a state that allows it. */
  PRECONDITION_FAILED: 412,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  /** An upstream dependency (connector, provider API) failed or rejected the call. */
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  /** An upstream dependency did not answer in time. */
  GATEWAY_TIMEOUT: 504,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/**
 * Machine-readable context sent with an error. `reason` is a stable
 * SCREAMING_SNAKE identifier (e.g. `THREAD_NOT_FOUND`) that clients can branch
 * on; other keys add context such as the resource and id involved.
 */
export type ErrorDetails = { reason?: string } & { [key: string]: JsonValue };

type ErrorOptions = {
  details?: { [key: string]: JsonValue };
  cause?: unknown;
};

/**
 * An error whose code, message, and details are safe to show to the caller.
 * Anything thrown that is not an `AppError` (or another live-state
 * `PublicError`) reaches clients as a masked `INTERNAL_SERVER_ERROR`, so plain
 * `Error` is the right choice for invariants and server misconfiguration.
 *
 * `message` is shown to users as-is: write it as a sentence, never include
 * secrets or raw upstream responses.
 */
export class AppError extends PublicError<ErrorCode, ErrorDetails> {
  readonly reason: string;

  constructor(
    code: ErrorCode,
    reason: string,
    message: string,
    options: ErrorOptions = {}
  ) {
    super({
      code,
      details: { ...options.details, reason },
      message,
      status: ERROR_STATUS[code],
    });
    this.name = "AppError";
    this.reason = reason;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

const humanize = (resource: string): string => {
  const words = resource.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const toReasonPrefix = (resource: string): string =>
  resource
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();

/** Terse constructors for the common cases. */
export const errors = {
  /** No valid credentials were presented, or they were rejected. */
  unauthorized: (
    reason = "UNAUTHORIZED",
    message = "Authentication required",
    options?: ErrorOptions
  ) => new AppError("UNAUTHORIZED", reason, message, options),

  /** The caller is authenticated but not allowed to do this. */
  forbidden: (
    reason = "FORBIDDEN",
    message = "You don't have permission to perform this action",
    options?: ErrorOptions
  ) => new AppError("FORBIDDEN", reason, message, options),

  /**
   * `resource` is a singular noun such as `"thread"` or `"agent chat"`; it
   * becomes both the message ("Thread not found") and the reason
   * (`THREAD_NOT_FOUND`).
   */
  notFound: (
    resource: string,
    details?: { [key: string]: JsonValue },
    options?: Omit<ErrorOptions, "details">
  ) =>
    new AppError(
      "NOT_FOUND",
      `${toReasonPrefix(resource)}_NOT_FOUND`,
      `${humanize(resource)} not found`,
      { ...options, details: { resource, ...details } }
    ),

  badRequest: (reason: string, message: string, options?: ErrorOptions) =>
    new AppError("BAD_REQUEST", reason, message, options),

  conflict: (reason: string, message: string, options?: ErrorOptions) =>
    new AppError("CONFLICT", reason, message, options),

  preconditionFailed: (
    reason: string,
    message: string,
    options?: ErrorOptions
  ) => new AppError("PRECONDITION_FAILED", reason, message, options),

  /** The workspace's plan does not include this feature. */
  featureNotAvailable: (feature?: string) =>
    new AppError(
      "FORBIDDEN",
      "FEATURE_NOT_AVAILABLE",
      "This feature isn't available on your current plan",
      feature ? { details: { feature } } : undefined
    ),

  /** Development-only tooling called outside local development. */
  devOnly: () =>
    new AppError(
      "FORBIDDEN",
      "DEV_ONLY",
      "This action is only available in local development"
    ),

  badGateway: (reason: string, message: string, options?: ErrorOptions) =>
    new AppError("BAD_GATEWAY", reason, message, options),

  gatewayTimeout: (reason: string, message: string, options?: ErrorOptions) =>
    new AppError("GATEWAY_TIMEOUT", reason, message, options),

  serviceUnavailable: (
    reason: string,
    message: string,
    options?: ErrorOptions
  ) => new AppError("SERVICE_UNAVAILABLE", reason, message, options),
};

/** Whether `error` (or any error in its `cause` chain) is a Postgres unique violation. */
export const isUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { cause?: unknown; code?: unknown };
  return (
    candidate.code === "23505" ||
    (candidate.cause !== undefined &&
      candidate.cause !== error &&
      isUniqueViolation(candidate.cause))
  );
};

// --- Client helpers ---------------------------------------------------------
//
// Errors cross the wire as live-state `PublicError`s, so clients see
// `PublicError` instances, not `AppError`. These helpers only rely on the
// serialized shape.

export { isPublicError, PublicError };

/** The error's `details.reason`, falling back to its code. */
export const getErrorReason = (error: unknown): string | undefined => {
  if (!isPublicError(error)) {
    return undefined;
  }
  const details = error.details;
  if (
    details &&
    typeof details === "object" &&
    !Array.isArray(details) &&
    typeof details.reason === "string"
  ) {
    return details.reason;
  }
  return error.code;
};

export const hasErrorReason = (error: unknown, reason: string): boolean =>
  getErrorReason(error) === reason;

export const hasErrorCode = (error: unknown, code: ErrorCode): boolean =>
  isPublicError(error) && error.code === code;

/**
 * A message fit for a toast. Public, non-internal errors carry a message
 * written for users; anything else (network failures, masked server errors,
 * client bugs) gets the caller's fallback.
 */
export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (
    isPublicError(error) &&
    error.code !== "INTERNAL_SERVER_ERROR" &&
    error.message
  ) {
    return error.message;
  }
  return fallback;
};

/**
 * The live-state error envelope for a plain HTTP route, so non-live-state
 * endpoints answer in the same `{ error: { code, message, status, details } }`
 * shape. Non-public errors are masked.
 */
export const toErrorResponse = (
  error: unknown
): { status: number; body: { error: SerializedPublicError } } => {
  const serialized = serializePublicError(error);
  return { body: { error: serialized }, status: serialized.status };
};
