/**
 * Credential failures are not per-thread failures. The API returns the same
 * opaque message for a revoked, expired, or wrong-environment key, and retrying
 * the rest of a batch just produces one identical entry per fixture — so the
 * whole run aborts with the profile named instead.
 */
const CREDENTIAL_ERRORS = new Set([
  "CONFLICTING_API_CREDENTIALS",
  "INVALID_API_CREDENTIAL",
  "UNAUTHORIZED",
]);

export const isCredentialError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return [...CREDENTIAL_ERRORS].some((code) => message.includes(code));
};

export class CredentialError extends Error {
  constructor(profileName: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `profile "${profileName}": key rejected (${detail}). ` +
        `Check the key is not revoked or expired and belongs to this environment.`
    );
    this.name = "CredentialError";
  }
}
