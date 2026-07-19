import { createHash } from "node:crypto";
import { qdrantClient } from "./client";

// v2: FRO-203 reshaped the payload (eligibility + content hash, keyed by
// externalKey) and the embedded text (title + body + head ref). The v1
// collection was scaffolding that never had data written to it.
export const PRS_COLLECTION = "prs-v2";
export const PR_EMBEDDING_DIMENSIONS = 3072;

/**
 * Default cosine-similarity floor for treating a PR as a match (design lock,
 * FRO-201). Consumed by the push-side match and pull-side `related_prs` hint;
 * the index itself stores every eligible PR regardless of any thread's score.
 */
export const PR_MATCH_THRESHOLD = 0.85;

/**
 * A mirrored [external pull request](../../../../CONTEXT.md) as stored in the
 * vector index. The point is keyed deterministically by
 * `(organizationId, externalKey)` — the mirror row's real identity — so a
 * re-index overwrites in place rather than accumulating duplicates, and the same
 * upstream PR mirrored under two orgs stays on distinct points.
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
  /** Open and non-draft — only eligible PRs are returned by similarity search. */
  eligible: boolean;
  /** sha256 of the embed-relevant content (title + body + head ref); lets a
   * re-index skip re-embedding when only eligibility changed. */
  contentHash: string;
  updatedAt: number;
}

/**
 * Deterministic Qdrant point id for a PR. Qdrant point ids must be an unsigned
 * integer or a UUID string; we hash the mirror row's identity
 * (`organizationId:externalKey`) and format the digest as a UUID so the same PR
 * always lands on the same point (idempotent upsert) while two orgs mirroring the
 * same upstream PR never collide.
 */
export const prPointId = (
  organizationId: string,
  externalKey: string,
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

export const ensurePrsCollection = async (): Promise<boolean> => {
  try {
    const collections = await qdrantClient.getCollections();
    const collectionExists = collections.collections.some(
      (c) => c.name === PRS_COLLECTION,
    );

    if (collectionExists) {
      return true;
    }

    await qdrantClient.createCollection(PRS_COLLECTION, {
      vectors: {
        size: PR_EMBEDDING_DIMENSIONS,
        distance: "Cosine",
      },
      optimizers_config: {
        indexing_threshold: 0,
      },
    });

    await qdrantClient.createPayloadIndex(PRS_COLLECTION, {
      field_name: "organizationId",
      field_schema: "keyword",
    });

    await qdrantClient.createPayloadIndex(PRS_COLLECTION, {
      field_name: "externalKey",
      field_schema: "keyword",
    });

    await qdrantClient.createPayloadIndex(PRS_COLLECTION, {
      field_name: "repoFullName",
      field_schema: "keyword",
    });

    // The hot filter: similarity search only ever wants eligible PRs.
    await qdrantClient.createPayloadIndex(PRS_COLLECTION, {
      field_name: "eligible",
      field_schema: "bool",
    });

    console.log(`Created Qdrant collection: ${PRS_COLLECTION}`);
    return true;
  } catch (error) {
    console.error("Failed to ensure PRs collection:", error);
    return false;
  }
};

/** Fetch the stored point for a PR, or null when it was never indexed. */
export const getPrPoint = async (
  organizationId: string,
  externalKey: string,
): Promise<{ payload: PrPayload } | null> => {
  try {
    const points = await qdrantClient.retrieve(PRS_COLLECTION, {
      ids: [prPointId(organizationId, externalKey)],
      with_payload: true,
    });
    const point = points[0];
    if (!point) return null;
    return { payload: point.payload as unknown as PrPayload };
  } catch (error) {
    console.error(`Failed to retrieve PR vector ${externalKey}:`, error);
    return null;
  }
};

/** Upsert the full PR point (vector + payload). Used when content changes. */
export const upsertPrVector = async (
  vector: number[],
  payload: PrPayload,
): Promise<boolean> => {
  try {
    await qdrantClient.upsert(PRS_COLLECTION, {
      wait: true,
      points: [
        {
          id: prPointId(payload.organizationId, payload.externalKey),
          vector,
          payload: payload as unknown as Record<string, unknown>,
        },
      ],
    });
    return true;
  } catch (error) {
    console.error(`Failed to upsert PR vector ${payload.externalKey}:`, error);
    return false;
  }
};

/**
 * Flip a PR's eligibility (and `updatedAt`) without re-embedding — the cheap
 * path when a close / draft / reopen / ready_for_review event leaves the
 * embed-relevant content unchanged.
 */
export const setPrEligibility = async (
  organizationId: string,
  externalKey: string,
  eligible: boolean,
  updatedAt: number,
): Promise<boolean> => {
  try {
    await qdrantClient.setPayload(PRS_COLLECTION, {
      wait: true,
      points: [prPointId(organizationId, externalKey)],
      payload: { eligible, updatedAt },
    });
    return true;
  } catch (error) {
    console.error(`Failed to set PR eligibility ${externalKey}:`, error);
    return false;
  }
};

/** Remove a PR's point (mirror row deleted / transferred out). */
export const deletePrVector = async (
  organizationId: string,
  externalKey: string,
): Promise<boolean> => {
  try {
    await qdrantClient.delete(PRS_COLLECTION, {
      wait: true,
      points: [prPointId(organizationId, externalKey)],
    });
    return true;
  } catch (error) {
    console.error(`Failed to delete PR vector ${externalKey}:`, error);
    return false;
  }
};

export interface SimilarPrSearchOptions {
  organizationId: string;
  limit?: number;
  scoreThreshold?: number;
  /** Restrict to eligible (open, non-draft) PRs. Defaults to true — the only
   * case downstream match/hint code wants. */
  eligibleOnly?: boolean;
  /** PR keys to omit (e.g. one already linked to the thread). */
  excludeExternalKeys?: string[];
}

export interface SimilarPrResult {
  externalKey: string;
  score: number;
  payload: PrPayload;
}

/**
 * Rank PRs by similarity to a query vector (a thread embedding on the pull side,
 * a PR embedding on the push side), filtered to the org and — by default —
 * eligible PRs only.
 */
export const searchSimilarPrs = async (
  vector: number[],
  options: SimilarPrSearchOptions,
): Promise<SimilarPrResult[]> => {
  const {
    organizationId,
    limit = 10,
    scoreThreshold = PR_MATCH_THRESHOLD,
    eligibleOnly = true,
    excludeExternalKeys = [],
  } = options;

  try {
    const mustConditions: Array<{
      key: string;
      match: { value: string | number | boolean };
    }> = [{ key: "organizationId", match: { value: organizationId } }];

    if (eligibleOnly) {
      mustConditions.push({ key: "eligible", match: { value: true } });
    }

    const mustNotConditions = excludeExternalKeys.map((key) => ({
      key: "externalKey",
      match: { value: key },
    }));

    const results = await qdrantClient.search(PRS_COLLECTION, {
      vector,
      limit,
      score_threshold: scoreThreshold,
      filter: {
        must: mustConditions,
        must_not: mustNotConditions.length > 0 ? mustNotConditions : undefined,
      },
      with_payload: true,
    });

    return results.map((result) => ({
      externalKey: (result.payload as unknown as PrPayload).externalKey,
      score: result.score,
      payload: result.payload as unknown as PrPayload,
    }));
  } catch (error) {
    console.error("Failed to search similar PRs:", error);
    return [];
  }
};
