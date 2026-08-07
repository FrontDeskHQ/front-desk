import { createHash } from "node:crypto";

import { log } from "@workspace/utils/logging";

import { errorFields } from "../logging";
import { qdrantClient } from "./client";

/**
 * The [issue index](../../../../CONTEXT.md) lives in its own collection rather
 * than sharing a typed collection with `prs-v2`: the two searches never want
 * mixed results, and `prs-v2` holds live data that a merge would have to
 * migrate.
 */
export const ISSUES_COLLECTION = "issues-v1";
export const ISSUE_EMBEDDING_DIMENSIONS = 3072;

/**
 * Cosine-similarity floor for treating an issue as a match. Deliberately the
 * same value as `PR_MATCH_THRESHOLD` — both sides embed with the same model in
 * the same space, so a different floor would only mean a differently-tuned
 * guess.
 */
export const ISSUE_MATCH_THRESHOLD = 0.85;

/**
 * A mirrored external issue as stored in the vector index. Keyed
 * deterministically by `(organizationId, externalKey)` — the mirror row's real
 * identity — so a re-index overwrites in place and the same upstream issue
 * mirrored under two orgs stays on distinct points.
 *
 * Note the absent `eligible` flag: unlike the PR index, every non-deleted issue
 * is searchable. `state` is stored so the hint can pass it to synthesis, not so
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

/**
 * Deterministic Qdrant point id for an issue. Qdrant point ids must be an
 * unsigned integer or a UUID string; we hash the mirror row's identity
 * (`organizationId:externalKey`) and format the digest as a UUID.
 */
export const issuePointId = (
  organizationId: string,
  externalKey: string
): string => {
  const hex = createHash("sha256")
    .update(`${organizationId}:${externalKey}`)
    .digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
};

export const ensureIssuesCollection = async (): Promise<boolean> => {
  try {
    const collections = await qdrantClient.getCollections();
    const collectionExists = collections.collections.some(
      (c) => c.name === ISSUES_COLLECTION
    );

    if (collectionExists) {
      return true;
    }

    await qdrantClient.createCollection(ISSUES_COLLECTION, {
      optimizers_config: {
        indexing_threshold: 0,
      },
      vectors: {
        distance: "Cosine",
        size: ISSUE_EMBEDDING_DIMENSIONS,
      },
    });

    await qdrantClient.createPayloadIndex(ISSUES_COLLECTION, {
      field_name: "organizationId",
      field_schema: "keyword",
    });

    await qdrantClient.createPayloadIndex(ISSUES_COLLECTION, {
      field_name: "externalKey",
      field_schema: "keyword",
    });

    await qdrantClient.createPayloadIndex(ISSUES_COLLECTION, {
      field_name: "repoFullName",
      field_schema: "keyword",
    });

    log.info({
      action: "worker.qdrant",
      operation: "collection.create",
      collection: ISSUES_COLLECTION,
      embeddingDimensions: ISSUE_EMBEDDING_DIMENSIONS,
    });
    return true;
  } catch (error) {
    log.error({
      action: "worker.qdrant",
      operation: "collection.ensure",
      collection: ISSUES_COLLECTION,
      error: errorFields(error),
    });
    return false;
  }
};

/** Fetch the stored point for an issue, or null when it was never indexed. */
export const getIssuePoint = async (
  organizationId: string,
  externalKey: string
): Promise<{ payload: IssuePayload } | null> => {
  try {
    const points = await qdrantClient.retrieve(ISSUES_COLLECTION, {
      ids: [issuePointId(organizationId, externalKey)],
      with_payload: true,
    });
    const point = points[0];
    if (!point) {
      return null;
    }
    return { payload: point.payload as unknown as IssuePayload };
  } catch (error) {
    log.error({
      action: "worker.qdrant",
      operation: "issue_vector.retrieve",
      collection: ISSUES_COLLECTION,
      externalKey,
      organizationId,
      error: errorFields(error),
    });
    return null;
  }
};

/** Upsert the full issue point (vector + payload). Used when content changes. */
export const upsertIssueVector = async (
  vector: number[],
  payload: IssuePayload
): Promise<boolean> => {
  try {
    await qdrantClient.upsert(ISSUES_COLLECTION, {
      points: [
        {
          id: issuePointId(payload.organizationId, payload.externalKey),
          vector,
          payload: payload as unknown as Record<string, unknown>,
        },
      ],
      wait: true,
    });
    return true;
  } catch (error) {
    log.error({
      action: "worker.qdrant",
      operation: "issue_vector.upsert",
      collection: ISSUES_COLLECTION,
      externalKey: payload.externalKey,
      organizationId: payload.organizationId,
      state: payload.state,
      error: errorFields(error),
    });
    return false;
  }
};

/**
 * Refresh a stored issue's state without re-embedding — the cheap path when a
 * close / reopen event leaves title and body unchanged. The point stays
 * searchable either way; only the evidence the hint carries changes.
 */
export const setIssueState = async (
  organizationId: string,
  externalKey: string,
  state: string,
  updatedAt: number
): Promise<boolean> => {
  try {
    await qdrantClient.setPayload(ISSUES_COLLECTION, {
      payload: { state, updatedAt },
      points: [issuePointId(organizationId, externalKey)],
      wait: true,
    });
    return true;
  } catch (error) {
    log.error({
      action: "worker.qdrant",
      operation: "issue_vector.update_state",
      collection: ISSUES_COLLECTION,
      externalKey,
      organizationId,
      state,
      error: errorFields(error),
    });
    return false;
  }
};

/** Remove an issue's point (mirror row deleted / transferred out). */
export const deleteIssueVector = async (
  organizationId: string,
  externalKey: string
): Promise<boolean> => {
  try {
    await qdrantClient.delete(ISSUES_COLLECTION, {
      points: [issuePointId(organizationId, externalKey)],
      wait: true,
    });
    return true;
  } catch (error) {
    log.error({
      action: "worker.qdrant",
      operation: "issue_vector.delete",
      collection: ISSUES_COLLECTION,
      externalKey,
      organizationId,
      error: errorFields(error),
    });
    return false;
  }
};

export interface SimilarIssueSearchOptions {
  organizationId: string;
  limit?: number;
  scoreThreshold?: number;
  /** Issue keys to omit (e.g. one already linked to the thread). */
  excludeExternalKeys?: string[];
}

export interface SimilarIssueResult {
  externalKey: string;
  score: number;
  payload: IssuePayload;
}

/**
 * Rank issues by similarity to a query vector (a thread embedding for the
 * `related_issues` hint, a text embedding for the `search_issues` tool),
 * filtered to the org.
 *
 * There is no state filter, by design — see `IssuePayload`. Like
 * `searchSimilarPrs` this **throws** on backend failure rather than returning
 * `[]`, so a caller that persists a hint can tell "no matching issues" apart
 * from a transient Qdrant error and never clears a valid lead on a failed search.
 */
export const searchSimilarIssues = async (
  vector: number[],
  options: SimilarIssueSearchOptions
): Promise<SimilarIssueResult[]> => {
  const {
    organizationId,
    limit = 10,
    scoreThreshold = ISSUE_MATCH_THRESHOLD,
    excludeExternalKeys = [],
  } = options;

  const mustNotConditions = excludeExternalKeys.map((key) => ({
    key: "externalKey",
    match: { value: key },
  }));

  const results = await qdrantClient.search(ISSUES_COLLECTION, {
    filter: {
      must: [{ key: "organizationId", match: { value: organizationId } }],
      must_not: mustNotConditions.length > 0 ? mustNotConditions : undefined,
    },
    limit,
    score_threshold: scoreThreshold,
    vector,
    with_payload: true,
  });

  return results.map((result) => ({
    externalKey: (result.payload as unknown as IssuePayload).externalKey,
    payload: result.payload as unknown as IssuePayload,
    score: result.score,
  }));
};
