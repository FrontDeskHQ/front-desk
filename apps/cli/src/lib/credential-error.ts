import { getErrorReason, hasErrorCode } from "api/errors";

/**
 * Credential failures are not per-thread failures. The API returns the same
 * opaque error for a revoked, expired, or wrong-environment key, and retrying
 * the rest of a batch just produces one identical entry per fixture — so the
 * whole run aborts with the profile named instead.
 */
export const isCredentialError = (error: unknown): boolean =>
  hasErrorCode(error, "UNAUTHORIZED") || hasErrorCode(error, "FORBIDDEN");

export class CredentialError extends Error {
  constructor(profileName: string, cause: unknown) {
    const detail =
      getErrorReason(cause) ??
      (cause instanceof Error ? cause.message : String(cause));
    super(
      `profile "${profileName}": key rejected (${detail}). ` +
        `Check the key is not revoked or expired and belongs to this environment.`
    );
    this.name = "CredentialError";
  }
}
