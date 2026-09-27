import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  didExternalEntityFinish,
  fanOutEntityFinished,
  isExternalEntityFinished,
} from "./entity-finished";
import type { ExternalEntityFinishState } from "./entity-finished";
import { enqueueThreadRead } from "./queue";

vi.mock(import("./queue"), () => ({
  enqueueThreadRead: vi.fn<typeof enqueueThreadRead>(),
}));

const issue = (state: string): ExternalEntityFinishState => ({
  externalKey: "github:acme/app#1",
  merged: null,
  organizationId: "org-1",
  state,
  type: "issue",
  url: "https://github.com/acme/app/issues/1",
});

const pullRequest = (
  state: string,
  merged: boolean
): ExternalEntityFinishState => ({
  externalKey: "github:acme/app#2",
  merged,
  organizationId: "org-1",
  state,
  type: "pull_request",
  url: "https://github.com/acme/app/pull/2",
});

describe("external entity finish detection", () => {
  beforeEach(() => {
    vi.mocked(enqueueThreadRead).mockReset();
  });
  it("recognizes terminal issues and merged pull requests", () => {
    expect(isExternalEntityFinished(issue("closed"))).toBeTruthy();
    expect(isExternalEntityFinished(issue("completed"))).toBeTruthy();
    expect(isExternalEntityFinished(issue("canceled"))).toBeTruthy();
    expect(isExternalEntityFinished(issue("duplicate"))).toBeTruthy();
    expect(isExternalEntityFinished(pullRequest("closed", true))).toBeTruthy();
  });

  it("does not treat a closed unmerged pull request as finished", () => {
    expect(isExternalEntityFinished(pullRequest("closed", false))).toBeFalsy();
  });

  it("only emits a transition for a previously known unfinished entity", () => {
    expect(
      didExternalEntityFinish(issue("open"), issue("closed"))
    ).toBeTruthy();
    expect(didExternalEntityFinish(null, issue("closed"))).toBeFalsy();
    expect(
      didExternalEntityFinish(issue("closed"), issue("closed"))
    ).toBeFalsy();
  });

  it("fans out the entity payload only to linked live threads", async () => {
    vi.mocked(enqueueThreadRead).mockResolvedValue({
      disposition: "scheduled",
      jobId: "thread:live:read",
    });
    const db = {
      find: vi
        .fn<() => Promise<Record<string, { id: string; status: number }>>>()
        .mockResolvedValue({
          closed: { id: "closed", status: 2 },
          live: { id: "live", status: 1 },
        }),
    } as unknown as Parameters<typeof fanOutEntityFinished>[0];

    const result = await fanOutEntityFinished(db, issue("closed"));

    expect(enqueueThreadRead).toHaveBeenCalledExactlyOnceWith("live", {
      entityFinished: {
        externalKey: "github:acme/app#1",
        type: "issue",
        url: "https://github.com/acme/app/issues/1",
      },
      kind: "entity_finished",
      organizationId: "org-1",
    });
    expect(result).toStrictEqual({
      enqueued: 1,
      jobIds: ["thread:live:read"],
      unavailable: 0,
    });
  });
});
