import type {
  SimilarThreadResult,
  ThreadPayload,
} from "../../../../../lib/qdrant/threads";

// NOTE: `searchSimilarThreads` already excludes the current thread and applies
// score_threshold at the Qdrant layer. These fixtures represent the *post-
// filter* result list — the picker's job is only to choose the single top
// hit above its own threshold (a defense-in-depth check) and shape evidence.

const payload = (id: string): ThreadPayload => ({
  threadId: id,
  organizationId: "org_test",
  title: `Thread ${id}`,
  shortDescription: "",
  keywords: [],
  entities: [],
  expectedAction: "triage",
  status: 0,
  priority: 0,
  authorId: "",
  assignedUserId: null,
  labels: [],
  createdAt: 0,
  updatedAt: 0,
});

const r = (threadId: string, score: number): SimilarThreadResult => ({
  threadId,
  score,
  payload: payload(threadId),
});

export type DuplicateTestCase = {
  name: string;
  input: { results: SimilarThreadResult[]; threshold: number };
  expected: { expectedThreadId: string | null };
};

const T = 0.85;

export const duplicateDataset: DuplicateTestCase[] = [
  // --- True duplicate at top with high score ---------------------------
  {
    name: "single high-score duplicate at top (0.95)",
    input: { results: [r("dup_a", 0.95)], threshold: T },
    expected: { expectedThreadId: "dup_a" },
  },
  {
    name: "single high-score duplicate at threshold boundary (0.85)",
    input: { results: [r("dup_a", 0.85)], threshold: T },
    expected: { expectedThreadId: "dup_a" },
  },
  {
    name: "top duplicate above threshold, others below",
    input: {
      results: [r("dup_a", 0.92), r("other_b", 0.6), r("other_c", 0.4)],
      threshold: T,
    },
    expected: { expectedThreadId: "dup_a" },
  },
  {
    name: "duplicate at 0.99 (very high confidence)",
    input: { results: [r("dup_a", 0.99)], threshold: T },
    expected: { expectedThreadId: "dup_a" },
  },
  {
    name: "duplicate at 0.87 (just above threshold)",
    input: { results: [r("dup_a", 0.87)], threshold: T },
    expected: { expectedThreadId: "dup_a" },
  },

  // --- Top result plausible but below threshold ------------------------
  {
    name: "top result at 0.84 (just below threshold) -> null",
    input: { results: [r("near_a", 0.84)], threshold: T },
    expected: { expectedThreadId: null },
  },
  {
    name: "top result at 0.80 -> null",
    input: { results: [r("near_a", 0.8)], threshold: T },
    expected: { expectedThreadId: null },
  },
  {
    name: "all results below threshold -> null",
    input: {
      results: [r("near_a", 0.82), r("near_b", 0.75), r("near_c", 0.71)],
      threshold: T,
    },
    expected: { expectedThreadId: null },
  },
  {
    name: "result at 0.7 (Qdrant default) but above duplicate threshold -> null",
    input: { results: [r("near_a", 0.7)], threshold: T },
    expected: { expectedThreadId: null },
  },
  {
    name: "single result barely missing threshold (0.849)",
    input: { results: [r("near_a", 0.849)], threshold: T },
    expected: { expectedThreadId: null },
  },

  // --- Multiple high-score candidates -> pick the highest, single emit -
  {
    name: "two above threshold, pick higher",
    input: { results: [r("dup_a", 0.88), r("dup_b", 0.93)], threshold: T },
    expected: { expectedThreadId: "dup_b" },
  },
  {
    name: "three above threshold, pick highest",
    input: {
      results: [r("dup_a", 0.86), r("dup_b", 0.91), r("dup_c", 0.97)],
      threshold: T,
    },
    expected: { expectedThreadId: "dup_c" },
  },
  {
    name: "results not pre-sorted, pick highest",
    input: {
      results: [r("dup_a", 0.97), r("dup_b", 0.89), r("dup_c", 0.92)],
      threshold: T,
    },
    expected: { expectedThreadId: "dup_a" },
  },

  // --- Empty results ---------------------------------------------------
  {
    name: "empty results -> null",
    input: { results: [], threshold: T },
    expected: { expectedThreadId: null },
  },
  {
    name: "empty results with high threshold -> null",
    input: { results: [], threshold: 0.99 },
    expected: { expectedThreadId: null },
  },

  // --- Edges -----------------------------------------------------------
  {
    name: "tied top scores -> picks first encountered tied value",
    input: { results: [r("dup_a", 0.9), r("dup_b", 0.9)], threshold: T },
    expected: { expectedThreadId: "dup_a" },
  },
  {
    name: "one above, one below threshold",
    input: { results: [r("dup_a", 0.86), r("near_b", 0.8)], threshold: T },
    expected: { expectedThreadId: "dup_a" },
  },
  {
    name: "mixed scores with above-threshold not first",
    input: {
      results: [r("near_a", 0.7), r("dup_b", 0.88), r("near_c", 0.6)],
      threshold: T,
    },
    expected: { expectedThreadId: "dup_b" },
  },
  {
    name: "high threshold filters out otherwise-good match",
    input: { results: [r("dup_a", 0.9)], threshold: 0.95 },
    expected: { expectedThreadId: null },
  },
  {
    name: "lower custom threshold accepts mid-score match",
    input: { results: [r("dup_a", 0.78)], threshold: 0.75 },
    expected: { expectedThreadId: "dup_a" },
  },
];
