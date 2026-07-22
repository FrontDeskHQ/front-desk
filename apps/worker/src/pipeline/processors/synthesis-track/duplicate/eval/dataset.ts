import type {
  SimilarThreadResult,
  ThreadPayload,
} from "../../../../../lib/qdrant/threads";

// NOTE: `searchSimilarThreads` already excludes the current thread and applies
// score_threshold at the Qdrant layer. These fixtures represent the *post-
// filter* result list — the picker's job is only to choose the single top
// hit above its own threshold (a defense-in-depth check) and shape evidence.

const payload = (id: string): ThreadPayload => ({
  assignedUserId: null,
  authorId: "",
  createdAt: 0,
  entities: [],
  expectedAction: "triage",
  keywords: [],
  labels: [],
  organizationId: "org_test",
  priority: 0,
  shortDescription: "",
  status: 0,
  threadId: id,
  title: `Thread ${id}`,
  updatedAt: 0,
});

const r = (threadId: string, score: number): SimilarThreadResult => ({
  payload: payload(threadId),
  score,
  threadId,
});

export interface DuplicateTestCase {
  name: string;
  input: { results: SimilarThreadResult[]; threshold: number };
  expected: { expectedThreadId: string | null };
}

const T = 0.85;

export const duplicateDataset: DuplicateTestCase[] = [
  // --- True duplicate at top with high score ---------------------------
  {
    expected: { expectedThreadId: "dup_a" },
    input: { results: [r("dup_a", 0.95)], threshold: T },
    name: "single high-score duplicate at top (0.95)",
  },
  {
    expected: { expectedThreadId: "dup_a" },
    input: { results: [r("dup_a", 0.85)], threshold: T },
    name: "single high-score duplicate at threshold boundary (0.85)",
  },
  {
    expected: { expectedThreadId: "dup_a" },
    input: {
      results: [r("dup_a", 0.92), r("other_b", 0.6), r("other_c", 0.4)],
      threshold: T,
    },
    name: "top duplicate above threshold, others below",
  },
  {
    expected: { expectedThreadId: "dup_a" },
    input: { results: [r("dup_a", 0.99)], threshold: T },
    name: "duplicate at 0.99 (very high confidence)",
  },
  {
    expected: { expectedThreadId: "dup_a" },
    input: { results: [r("dup_a", 0.87)], threshold: T },
    name: "duplicate at 0.87 (just above threshold)",
  },

  // --- Top result plausible but below threshold ------------------------
  {
    expected: { expectedThreadId: null },
    input: { results: [r("near_a", 0.84)], threshold: T },
    name: "top result at 0.84 (just below threshold) -> null",
  },
  {
    expected: { expectedThreadId: null },
    input: { results: [r("near_a", 0.8)], threshold: T },
    name: "top result at 0.80 -> null",
  },
  {
    expected: { expectedThreadId: null },
    input: {
      results: [r("near_a", 0.82), r("near_b", 0.75), r("near_c", 0.71)],
      threshold: T,
    },
    name: "all results below threshold -> null",
  },
  {
    expected: { expectedThreadId: null },
    input: { results: [r("near_a", 0.7)], threshold: T },
    name: "result at 0.7 (Qdrant default) but above duplicate threshold -> null",
  },
  {
    expected: { expectedThreadId: null },
    input: { results: [r("near_a", 0.849)], threshold: T },
    name: "single result barely missing threshold (0.849)",
  },

  // --- Multiple high-score candidates -> pick the highest, single emit -
  {
    expected: { expectedThreadId: "dup_b" },
    input: { results: [r("dup_a", 0.88), r("dup_b", 0.93)], threshold: T },
    name: "two above threshold, pick higher",
  },
  {
    expected: { expectedThreadId: "dup_c" },
    input: {
      results: [r("dup_a", 0.86), r("dup_b", 0.91), r("dup_c", 0.97)],
      threshold: T,
    },
    name: "three above threshold, pick highest",
  },
  {
    expected: { expectedThreadId: "dup_a" },
    input: {
      results: [r("dup_a", 0.97), r("dup_b", 0.89), r("dup_c", 0.92)],
      threshold: T,
    },
    name: "results not pre-sorted, pick highest",
  },

  // --- Empty results ---------------------------------------------------
  {
    expected: { expectedThreadId: null },
    input: { results: [], threshold: T },
    name: "empty results -> null",
  },
  {
    expected: { expectedThreadId: null },
    input: { results: [], threshold: 0.99 },
    name: "empty results with high threshold -> null",
  },

  // --- Edges -----------------------------------------------------------
  {
    expected: { expectedThreadId: "dup_a" },
    input: { results: [r("dup_a", 0.9), r("dup_b", 0.9)], threshold: T },
    name: "tied top scores -> picks first encountered tied value",
  },
  {
    expected: { expectedThreadId: "dup_a" },
    input: { results: [r("dup_a", 0.86), r("near_b", 0.8)], threshold: T },
    name: "one above, one below threshold",
  },
  {
    expected: { expectedThreadId: "dup_b" },
    input: {
      results: [r("near_a", 0.7), r("dup_b", 0.88), r("near_c", 0.6)],
      threshold: T,
    },
    name: "mixed scores with above-threshold not first",
  },
  {
    expected: { expectedThreadId: null },
    input: { results: [r("dup_a", 0.9)], threshold: 0.95 },
    name: "high threshold filters out otherwise-good match",
  },
  {
    expected: { expectedThreadId: "dup_a" },
    input: { results: [r("dup_a", 0.78)], threshold: 0.75 },
    name: "lower custom threshold accepts mid-score match",
  },
];
