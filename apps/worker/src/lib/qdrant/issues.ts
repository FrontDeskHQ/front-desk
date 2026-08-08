import { defineIndex, uuidFromParts } from "./define-index";
import type { SearchHit } from "./define-index";

/**
 * The [issue index](../../../../CONTEXT.md) lives in its own collection rather
 * than sharing one with `prs-v2`: the two searches never want mixed results,
 * and `prs-v2` holds live data that a merge would have to migrate.
 */
export const ISSUES_COLLECTION = "issues-v1";

/**
 * Cosine-similarity floor for treating an issue as a match. Deliberately the
 * same value as `PR_MATCH_THRESHOLD` — both sides embed with the same model in
 * the same space, so a different floor would only mean a differently-tuned
 * guess.
 */
export const ISSUE_MATCH_THRESHOLD = 0.85;

/**
 * A mirrored external issue as stored in the vector index.
 *
 * Note the absent `eligible` flag: unlike the PR index, every non-deleted issue
 * is searchable. `state` is stored so a hint can pass it to synthesis, not so
 * search can filter on it.
 */
export interface IssuePayload {
  /** Provider-agnostic key `provider:owner/repo#number`. */
  externalKey: string;
  /** Mirror row id, so a hit can resolve back to the FrontDesk issue row. */
  externalEntityId: string;
  organizationId: string;
  provider: string;
  repoFullName: string;
  number: number;
  url: string;
  title: string;
  /** Upstream state ("open" | "closed"). Carried as evidence, never filtered. */
  state: string;
  /** sha256 of the embed-relevant content (title + body); lets a re-index skip
   * re-embedding when only the state changed. */
  contentHash: string;
  updatedAt: number;
}

export type IssueHit = SearchHit<IssuePayload>;

export const issueIndex = defineIndex<
  IssuePayload,
  "organizationId" | "externalKey"
>({
  dimensions: 3072,
  key: ({ organizationId, externalKey }) =>
    uuidFromParts(organizationId, externalKey),
  name: ISSUES_COLLECTION,
  payloadIndexes: [
    { field: "organizationId", schema: "keyword" },
    { field: "externalKey", schema: "keyword" },
    { field: "repoFullName", schema: "keyword" },
  ],
});
