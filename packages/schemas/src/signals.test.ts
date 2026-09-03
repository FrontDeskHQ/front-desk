import { describe, expect, it } from "vitest";

import {
  fingerprintAgentRead,
  mergeThreadReadTriggers,
  normalizeThreadReadJobData,
  sortThreadReadTriggers,
  statusWitnessSchema,
  threadReadTriggerSchema,
} from "./signals";
import type { ThreadRead } from "./signals";

const candidate = (prId: string, score: number, title = prId) => ({
  prId,
  score,
  title,
  url: `https://example.com/${prId}`,
});

const finished = (externalKey: string) => ({
  externalKey,
  type: "issue" as const,
  url: `https://example.com/${externalKey}`,
});

describe("thread-read trigger contracts", () => {
  it("requires a finished-entity candidate for entity_finished", () => {
    expect(
      threadReadTriggerSchema.safeParse({ kind: "entity_finished" }).success
    ).toBe(false);
  });

  it("accepts opaque non-empty provider URLs from the mirror", () => {
    expect(
      threadReadTriggerSchema.safeParse({
        entityFinished: {
          externalKey: "provider:item-1",
          type: "issue",
          url: "provider-local-reference",
        },
        kind: "entity_finished",
      }).success
    ).toBe(true);
  });

  it("preserves queue generation for audit identity", () => {
    expect(
      normalizeThreadReadJobData({
        generation: 4,
        threadId: "thread-1",
        triggers: [{ kind: "message" }],
      })
    ).toStrictEqual({
      generation: 4,
      threadId: "thread-1",
      triggers: [{ kind: "message" }],
    });
  });

  it("preserves queue generation for legacy payloads", () => {
    expect(
      normalizeThreadReadJobData({
        generation: 4,
        kind: "message",
        threadId: "thread-1",
      })
    ).toStrictEqual({
      generation: 4,
      threadId: "thread-1",
      triggers: [{ kind: "message" }],
    });
  });

  it("degrades an incomplete legacy entity_finished cause to manual", () => {
    expect(
      normalizeThreadReadJobData({
        kind: "entity_finished",
        threadId: "thread-1",
      })
    ).toStrictEqual({
      threadId: "thread-1",
      triggers: [{ kind: "manual" }],
    });
  });

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

  it("coalesces finished entities independently and refreshes matching payloads", () => {
    const triggers = mergeThreadReadTriggers(
      [
        {
          entityFinished: finished("issue-1"),
          kind: "entity_finished" as const,
        },
      ],
      [
        {
          entityFinished: finished("issue-2"),
          kind: "entity_finished" as const,
        },
        {
          entityFinished: {
            ...finished("issue-1"),
            url: "https://example.com/refreshed",
          },
          kind: "entity_finished" as const,
        },
      ]
    );

    expect(triggers).toStrictEqual([
      {
        entityFinished: {
          ...finished("issue-1"),
          url: "https://example.com/refreshed",
        },
        kind: "entity_finished",
      },
      {
        entityFinished: finished("issue-2"),
        kind: "entity_finished",
      },
    ]);
  });
});

describe("status witness contracts", () => {
  it("requires an outcome for entity_settled", () => {
    expect(
      statusWitnessSchema.safeParse({
        class: "entity_settled",
        sources: ["https://example.com/issue/1"],
      }).success
    ).toBe(false);
  });
});

describe(fingerprintAgentRead, () => {
  it("is stable when nested action keys are reshuffled (jsonb vs insertion order)", () => {
    const insertionOrder: ThreadRead = {
      alternatives: [{ draftMarkdown: "hi", kind: "reply" }],
      createdAt: "2026-08-14T13:52:18.597Z",
      primary: [
        { kind: "set_status", status: 2 },
        {
          draftMarkdown: "hello",
          grounding: { class: "inferred", entityUrl: null, sources: [] },
          kind: "reply",
        },
      ],
      reasoning: "because",
      recommendation: "Reply and resolve",
      sourceInputMessageId: "msg-1",
      summary: "Customer asked",
      urgencyScore: 40,
    };
    const jsonbOrder: ThreadRead = {
      alternatives: [{ kind: "reply", draftMarkdown: "hi" }],
      createdAt: "2026-08-14T13:52:18.597Z",
      primary: [
        { status: 2, kind: "set_status" },
        {
          kind: "reply",
          grounding: { sources: [], class: "inferred", entityUrl: null },
          draftMarkdown: "hello",
        },
      ],
      reasoning: "because",
      recommendation: "Reply and resolve",
      sourceInputMessageId: "msg-1",
      summary: "Customer asked",
      urgencyScore: 40,
    };

    expect(JSON.stringify(jsonbOrder.primary[0])).not.toBe(
      JSON.stringify(insertionOrder.primary[0])
    );
    expect(fingerprintAgentRead(jsonbOrder)).toBe(
      fingerprintAgentRead(insertionOrder)
    );
  });
});
