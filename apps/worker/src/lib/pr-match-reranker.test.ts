import { describe, expect, it } from "vitest";

import {
  applyPrMatchRerankDecisions,
  buildPrMatchRerankPrompt,
  buildPrMatchRerankSystemPrompt,
} from "./pr-match-reranker";
import type { SimilarThreadResult } from "./qdrant/threads";

const candidate = (
  threadId: string,
  title: string,
  shortDescription: string,
  score: number
): SimilarThreadResult => ({
  payload: {
    assignedUserId: null,
    authorId: "author",
    createdAt: 0,
    entities: ["storage"],
    expectedAction: "bug fix",
    keywords: ["progress"],
    labels: [],
    organizationId: "org",
    priority: 0,
    shortDescription,
    status: 0,
    threadId,
    title,
    updatedAt: 0,
  },
  score,
  threadId,
});

describe("PR match reranking", () => {
  it("lets an opposite-wording symptom/fix pair reach final acceptance", () => {
    const supportThread = candidate(
      "thread-progress",
      "Progress bar barely moves",
      "The upload progress indicator stays near zero even though the upload completes.",
      0.816
    );

    const prompt = buildPrMatchRerankPrompt(
      {
        body: "Convert the stored upload ratio into a percentage before rendering progress.",
        headRef: "fix/upload-progress",
        title: "Show upload progress as a percentage",
      },
      [supportThread]
    );

    expect(prompt).toContain("Progress bar barely moves");
    expect(prompt).toContain(
      "Convert the stored upload ratio into a percentage"
    );
    expect(buildPrMatchRerankSystemPrompt(0.85)).toContain("at least 0.85");

    const [decision] = applyPrMatchRerankDecisions(
      [supportThread],
      [
        {
          accepted: true,
          reason: "The percentage conversion explains the progress symptom.",
          score: 0.93,
          threadId: "thread-progress",
        },
      ],
      0.85
    );

    expect(decision?.accepted).toBeTruthy();
    expect(decision?.retrievalScore).toBe(0.816);
  });

  it("rejects a hard negative with overlapping product vocabulary", () => {
    const unrelatedThread = candidate(
      "thread-storage-quota",
      "Storage quota warning",
      "The account is blocked because its storage quota is exhausted.",
      0.88
    );

    const [decision] = applyPrMatchRerankDecisions(
      [unrelatedThread],
      [
        {
          accepted: false,
          reason:
            "The PR changes progress rendering, not account quota limits.",
          score: 0.12,
          threadId: "thread-storage-quota",
        },
      ],
      0.85
    );

    expect(decision?.accepted).toBeFalsy();
    expect(decision?.reason).toContain("quota limits");
  });

  it("rejects a candidate when the reranker omits its decision", () => {
    const candidateWithoutDecision = candidate(
      "thread-missing-decision",
      "Progress bar barely moves",
      "The upload progress indicator stays near zero even though the upload completes.",
      0.9
    );

    const [decision] = applyPrMatchRerankDecisions(
      [candidateWithoutDecision],
      [],
      0.85
    );

    expect(decision?.accepted).toBeFalsy();
    expect(decision?.reason).toBe("reranker_missing_decision");
  });
});
