import {
  mergeThreadReadTriggers,
  normalizeThreadReadJobData,
  sortThreadReadTriggers,
} from "@workspace/schemas/signals";
import { describe, expect, it } from "vitest";

const pr = (prId: string, score: number) => ({
  kind: "pr_matched" as const,
  prMatched: {
    prId,
    score,
    title: `PR ${prId}`,
    url: `https://github.com/acme/app/pull/${prId}`,
  },
});

describe("thread-read trigger merging", () => {
  it("preserves multiple causes and PR candidates", () => {
    expect(
      mergeThreadReadTriggers(
        [{ kind: "message" }],
        [pr("pr-1", 0.8), pr("pr-2", 0.9)]
      )
    ).toStrictEqual([{ kind: "message" }, pr("pr-1", 0.8), pr("pr-2", 0.9)]);
  });

  it("deduplicates causes while keeping the newest PR payload", () => {
    expect(
      mergeThreadReadTriggers(
        [pr("pr-1", 0.8), { kind: "manual" }],
        [pr("pr-1", 0.95), { kind: "manual" }]
      )
    ).toStrictEqual([pr("pr-1", 0.95), { kind: "manual" }]);
  });

  it("normalizes legacy single-trigger jobs during rollout", () => {
    expect(
      normalizeThreadReadJobData({
        kind: "pr_matched",
        prMatched: pr("pr-1", 0.8).prMatched,
        threadId: "thread-1",
      })
    ).toStrictEqual({
      threadId: "thread-1",
      triggers: [pr("pr-1", 0.8)],
    });
  });

  it("provides stable ordering for idempotency hashes", () => {
    expect(
      sortThreadReadTriggers([
        pr("pr-2", 0.9),
        { kind: "message" },
        pr("pr-1", 0.8),
      ])
    ).toStrictEqual(
      sortThreadReadTriggers([
        { kind: "message" },
        pr("pr-1", 0.8),
        pr("pr-2", 0.9),
      ])
    );
  });
});
