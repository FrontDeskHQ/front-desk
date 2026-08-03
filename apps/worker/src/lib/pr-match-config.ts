const DEFAULT_CANDIDATE_LIMIT = 20;
const MAX_CANDIDATE_LIMIT = 50;
const DEFAULT_RETRIEVAL_FLOOR = 0.7;
const DEFAULT_RERANK_THRESHOLD = 0.85;
const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const INTEGER_PATTERN = /^[+-]?\d+$/;

const readBoundedNumber = (
  name: string,
  fallback: number,
  min: number,
  max: number
): number => {
  const rawValue = process.env[name]?.trim() ?? "";
  if (!DECIMAL_PATTERN.test(rawValue)) {
    return fallback;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
};

const readBoundedInteger = (
  name: string,
  fallback: number,
  min: number,
  max: number
): number => {
  const rawValue = process.env[name]?.trim() ?? "";
  if (!INTEGER_PATTERN.test(rawValue)) {
    return fallback;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
};

/** Maximum number of thread vectors considered by one PR match job. */
export const PR_MATCH_CANDIDATE_LIMIT = readBoundedInteger(
  "PR_MATCH_CANDIDATE_LIMIT",
  DEFAULT_CANDIDATE_LIMIT,
  1,
  MAX_CANDIDATE_LIMIT
);

/**
 * Qdrant's first-stage floor. This is deliberately lower than the final
 * reranking threshold so symptom/fix pairs with different wording reach the
 * relevance judge.
 */
export const PR_MATCH_RETRIEVAL_FLOOR = readBoundedNumber(
  "PR_MATCH_RETRIEVAL_FLOOR",
  DEFAULT_RETRIEVAL_FLOOR,
  0,
  1
);

/** Minimum second-stage relevance score required to fan out a match. */
export const PR_MATCH_RERANK_THRESHOLD = readBoundedNumber(
  "PR_MATCH_RERANK_THRESHOLD",
  DEFAULT_RERANK_THRESHOLD,
  0,
  1
);
