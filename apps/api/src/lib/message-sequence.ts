import { monotonicFactory } from "ulid";

const nextSequence = monotonicFactory();

/**
 * A server-assigned cursor independent of the caller-controlled message ID.
 * The monotonic ULID factory keeps cursors ordered for writes handled by this
 * API process, including writes that share a millisecond timestamp.
 */
export const nextMessageInsertionSequence = (): string =>
  nextSequence().toLowerCase();
