import type { InferLiveObject } from "@live-state/sync";
import type { schema } from "../../live-state/schema";

type Thread = InferLiveObject<typeof schema.thread, { messages: true }>;

export type RelatedThreadsParams = {
  limit: number;
  minScore: number;
  k: number;
  excludeThreadIds: string[];
};

type RelatedThreadsMetadata = {
  hash?: string;
  params?: RelatedThreadsParams;
};

const normalizeParams = (
  params: RelatedThreadsParams
): RelatedThreadsParams => ({
  limit: params.limit,
  minScore: params.minScore,
  k: params.k,
  excludeThreadIds: [...params.excludeThreadIds].sort(),
});

export const getRelatedThreadsMetadata = (
  metadataStr: string | null | undefined
): RelatedThreadsMetadata => {
  if (!metadataStr) {
    return {};
  }
  try {
    return JSON.parse(metadataStr) as RelatedThreadsMetadata;
  } catch {
    return {};
  }
};

export const createRelatedThreadsMetadata = (
  hash: string,
  params: RelatedThreadsParams
): string => {
  const normalizedParams = normalizeParams(params);
  return JSON.stringify({ hash, params: normalizedParams });
};
