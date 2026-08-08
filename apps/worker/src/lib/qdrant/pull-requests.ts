import { defineIndex, uuidFromParts } from "./define-index";
import type { SearchHit } from "./define-index";

// v2: FRO-203 reshaped the payload (eligibility + content hash, keyed by
// externalKey) and the embedded text (title + body + head ref). The v1
// collection was scaffolding that never had data written to it.
export const PRS_COLLECTION = "prs-v2";

/**
 * Default cosine-similarity floor for treating a PR as a match (design lock,
 * FRO-201). Consumed by the pull-side `related_prs` hint; push-side matching
 * uses a broader retrieval floor followed by a separate relevance judge. The
 * index itself stores every eligible PR regardless of any thread's score.
 */
export const PR_MATCH_THRESHOLD = 0.85;

/**
 * A mirrored [external pull request](../../../../CONTEXT.md) as stored in the
 * vector index, keyed by `(organizationId, externalKey)` — the mirror row's
 * real identity.
 */
export interface PrPayload {
  /** Provider-agnostic key `provider:owner/repo#number`. */
  externalKey: string;
  /** Mirror row id, so a push-side match can resolve a `PrMatchCandidate.prId`. */
  externalEntityId: string;
  organizationId: string;
  provider: string;
  repoFullName: string;
  number: number;
  url: string;
  title: string;
  headRef: string | null;
  /** Open and non-draft. Search filters on this; the index stores both. */
  eligible: boolean;
  /** sha256 of the embed-relevant content (title + body + head ref); lets a
   * re-index skip re-embedding when only eligibility changed. */
  contentHash: string;
  updatedAt: number;
}

export type PrHit = SearchHit<PrPayload>;

export const prIndex = defineIndex<
  PrPayload,
  "organizationId" | "externalKey"
>({
  dimensions: 3072,
  key: ({ organizationId, externalKey }) =>
    uuidFromParts(organizationId, externalKey),
  name: PRS_COLLECTION,
  payloadIndexes: [
    { field: "organizationId", schema: "keyword" },
    { field: "externalKey", schema: "keyword" },
    { field: "repoFullName", schema: "keyword" },
    // The hot filter: similarity search only ever wants eligible PRs.
    { field: "eligible", schema: "bool" },
  ],
});
