import type { ServerDB } from "@live-state/sync/server";
import { describe, expect, it, vi } from "vitest";

import type { schema } from "../live-state/schema";
import { syncLinkedIssueState } from "./capability-dispatch";

describe(syncLinkedIssueState, () => {
  it("does not push FrontDesk state to Linear", async () => {
    const find = vi
      .fn<(...args: unknown[]) => Promise<Record<string, unknown>>>()
      .mockResolvedValueOnce({
        issue: {
          externalKey: "linear:issue-uuid",
          provider: "linear",
          state: "open",
        },
      });
    const db = { find } as unknown as Pick<ServerDB<typeof schema>, "find">;

    await syncLinkedIssueState(db, {
      closed: true,
      externalIssueId: "linear:issue-uuid",
      organizationId: "org-a",
    });

    expect(find).toHaveBeenCalledOnce();
  });
});
