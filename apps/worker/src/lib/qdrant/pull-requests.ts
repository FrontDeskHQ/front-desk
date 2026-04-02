import { qdrantClient } from "./client";

export const PRS_COLLECTION = "prs-v1";
export const PR_EMBEDDING_DIMENSIONS = 3072;

export interface PrPayload {
  prNumber: number;
  owner: string;
  repo: string;
  prUrl: string;
  prTitle: string;
  shortDescription: string;
  keywords: string[];
  organizationId: string;
  mergedAt: number;
  confidence: number;
}

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
      field_name: "owner",
      field_schema: "keyword",
    });

    await qdrantClient.createPayloadIndex(PRS_COLLECTION, {
      field_name: "repo",
      field_schema: "keyword",
    });

    await qdrantClient.createPayloadIndex(PRS_COLLECTION, {
      field_name: "prNumber",
      field_schema: "integer",
    });

    await qdrantClient.createPayloadIndex(PRS_COLLECTION, {
      field_name: "mergedAt",
      field_schema: "integer",
    });

    console.log(`Created Qdrant collection: ${PRS_COLLECTION}`);
    return true;
  } catch (error) {
    console.error("Failed to ensure PRs collection:", error);
    return false;
  }
};

export const upsertPrVector = async (
  pointId: string,
  vector: number[],
  payload: PrPayload,
): Promise<boolean> => {
  try {
    await qdrantClient.upsert(PRS_COLLECTION, {
      wait: true,
      points: [
        {
          id: pointId,
          vector,
          payload: payload as unknown as Record<string, unknown>,
        },
      ],
    });
    return true;
  } catch (error) {
    console.error(
      `Failed to upsert PR vector ${payload.owner}/${payload.repo}#${payload.prNumber} (pointId: ${pointId}):`,
      error,
    );
    return false;
  }
};

export const deletePrVectors = async (
  organizationId: string,
  prNumber: number,
  owner: string,
  repo: string,
): Promise<boolean> => {
  try {
    await qdrantClient.delete(PRS_COLLECTION, {
      wait: true,
      filter: {
        must: [
          { key: "organizationId", match: { value: organizationId } },
          { key: "prNumber", match: { value: prNumber } },
          { key: "owner", match: { value: owner } },
          { key: "repo", match: { value: repo } },
        ],
      },
    });
    return true;
  } catch (error) {
    console.error(
      `Failed to delete PR vector ${owner}/${repo}#${prNumber}:`,
      error,
    );
    return false;
  }
};
