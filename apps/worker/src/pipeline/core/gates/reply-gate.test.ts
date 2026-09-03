import type { MessageRole } from "@workspace/schemas/message-roles";
import type { Action, ReplyGrounding } from "@workspace/schemas/signals";
import { replyStateFingerprint } from "@workspace/schemas/signals";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchMirroredIssueByUrl,
  fetchMirroredPrByUrl,
} from "../../../lib/database/client";
import type { RunState } from "../run-state";
import { replyGate } from "./reply-gate";

vi.mock(import("../../../lib/database/client"), () => ({
  fetchMirroredIssueByUrl: vi.fn<typeof fetchMirroredIssueByUrl>(),
  fetchMirroredPrByUrl: vi.fn<typeof fetchMirroredPrByUrl>(),
}));

const issueUrl = "https://github.com/acme/app/issues/42";
const issueKey = "github:acme/app#42";
const prUrl = "https://github.com/acme/app/pull/43";
const prKey = "github:acme/app#43";
const grounding = {
  class: "state_report",
  entityUrl: issueUrl,
  sources: [],
} satisfies ReplyGrounding;
const reply: Action = {
  draftMarkdown: "The fix is live.",
  grounding,
  kind: "reply",
};

const makeRun = (
  stateFingerprint: string | null = null,
  links?: { externalIssueId?: string; externalPrId?: string }
) =>
  ({
    authors: async () => ({
      names: new Map(),
      roles: new Map<string, MessageRole>([["teammate-1", "teammate"]]),
    }),
    lastAutonomousReply: async () =>
      stateFingerprint ? { stateFingerprint } : null,
    organizationId: "org-a",
    thread: {
      assignedUserId: "user-1",
      ...(links ?? { externalIssueId: issueKey }),
      messages: [
        {
          authorId: "teammate-1",
          createdAt: new Date("2026-09-02T20:53:18.226Z"),
          id: "message-1",
        },
      ],
    },
  }) as unknown as RunState;

describe(replyGate, () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("allows the first autonomous follow-up for a verified delivered entity", async () => {
    vi.mocked(fetchMirroredPrByUrl).mockResolvedValue(null);
    vi.mocked(fetchMirroredIssueByUrl).mockResolvedValue({
      externalKey: issueKey,
      state: "closed",
    } as Awaited<ReturnType<typeof fetchMirroredIssueByUrl>>);

    await expect(
      replyGate(reply, {
        autoSiblings: [],
        run: makeRun(),
        verifiedDeliveredEntityUrls: new Set([issueUrl]),
      } as Parameters<typeof replyGate>[1])
    ).resolves.toMatchObject({ allowed: true });
  });

  it("still refuses to talk over a teammate without verified delivery", async () => {
    vi.mocked(fetchMirroredPrByUrl).mockResolvedValue(null);
    vi.mocked(fetchMirroredIssueByUrl).mockResolvedValue({
      externalKey: issueKey,
      state: "closed",
    } as Awaited<ReturnType<typeof fetchMirroredIssueByUrl>>);

    await expect(
      replyGate(reply, {
        autoSiblings: [],
        run: makeRun(),
        verifiedDeliveredEntityUrls: new Set(),
      } as Parameters<typeof replyGate>[1])
    ).resolves.toMatchObject({
      allowed: false,
      reason: "no_new_state_since_last_reply",
    });
  });

  it("still blocks a replay after the delivered state was already reported", async () => {
    vi.mocked(fetchMirroredPrByUrl).mockResolvedValue(null);
    vi.mocked(fetchMirroredIssueByUrl).mockResolvedValue({
      externalKey: issueKey,
      state: "closed",
    } as Awaited<ReturnType<typeof fetchMirroredIssueByUrl>>);
    const fingerprint = replyStateFingerprint(grounding, "closed");

    await expect(
      replyGate(reply, {
        autoSiblings: [],
        run: makeRun(fingerprint),
        verifiedDeliveredEntityUrls: new Set([issueUrl]),
      })
    ).resolves.toMatchObject({
      allowed: false,
      reason: "no_new_state_since_last_reply",
    });
  });

  it("allows a follow-up when a linked pull request becomes merged", async () => {
    const prGrounding = {
      class: "state_report",
      entityUrl: prUrl,
      sources: [],
    } satisfies ReplyGrounding;
    vi.mocked(fetchMirroredPrByUrl).mockResolvedValue({
      externalKey: prKey,
      merged: true,
      state: "open",
    } as Awaited<ReturnType<typeof fetchMirroredPrByUrl>>);

    await expect(
      replyGate(
        { ...reply, grounding: prGrounding },
        {
          autoSiblings: [],
          run: makeRun(replyStateFingerprint(prGrounding, "open"), {
            externalPrId: prKey,
          }),
          verifiedDeliveredEntityUrls: new Set([prUrl]),
        }
      )
    ).resolves.toMatchObject({
      allowed: true,
      stateFingerprint: replyStateFingerprint(prGrounding, "open+merged"),
    });
    expect(fetchMirroredIssueByUrl).not.toHaveBeenCalled();
  });
});
