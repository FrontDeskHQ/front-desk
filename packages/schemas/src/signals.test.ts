import { describe, expect, it } from "vitest";

import {
  mergeThreadReadTriggers,
  normalizeThreadReadJobData,
  sortThreadReadTriggers,
} from "./signals";

const candidate = (prId: string, score: number, title = prId) => ({
  prId,
  score,
  title,
  url: `https://example.com/${prId}`,
});

describe("thread-read trigger contracts", () => {
  it("normalizes legacy coalesced payloads without losing either cause", () => {
    expect(
      normalizeThreadReadJobData({
        kind: "message",
        prMatched: candidate("pr-1", 0.8),
        threadId: "thread-1",
      })
    ).toStrictEqual({
      threadId: "thread-1",
      triggers: [
        { kind: "message" },
        { kind: "pr_matched", prMatched: candidate("pr-1", 0.8) },
      ],
    });
  });

  it("normalizes a legacy matched PR into one candidate-bearing trigger", () => {
    expect(
      normalizeThreadReadJobData({
        kind: "pr_matched",
        prMatched: candidate("pr-1", 0.8),
        threadId: "thread-1",
      })
    ).toStrictEqual({
      threadId: "thread-1",
      triggers: [{ kind: "pr_matched", prMatched: candidate("pr-1", 0.8) }],
    });
  });

  it("preserves arrival order and refreshes a duplicate PR candidate in place", () => {
    const triggers = mergeThreadReadTriggers(
      [
        { kind: "pr_matched", prMatched: candidate("pr-1", 0.7, "old") },
        { kind: "message" },
      ],
      [
        { kind: "pr_matched", prMatched: candidate("pr-2", 0.9) },
        { kind: "pr_matched", prMatched: candidate("pr-1", 0.95, "new") },
        { kind: "message" },
      ]
    );

    expect(triggers).toStrictEqual([
      { kind: "pr_matched", prMatched: candidate("pr-1", 0.95, "new") },
      { kind: "message" },
      { kind: "pr_matched", prMatched: candidate("pr-2", 0.9) },
    ]);
  });

  it("sorts deterministically without changing the queue's FIFO merge order", () => {
    const left = [
      { kind: "manual" as const },
      { kind: "pr_matched" as const, prMatched: candidate("pr-2", 0.9) },
      { kind: "message" as const },
      { kind: "pr_matched" as const, prMatched: candidate("pr-1", 0.8) },
    ];
    const right = [...left].reverse();

    expect(sortThreadReadTriggers(left)).toStrictEqual(
      sortThreadReadTriggers(right)
    );
  });
});
