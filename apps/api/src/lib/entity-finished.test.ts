import { beforeEach, describe, expect, it, vi } from "vitest";

import { enqueueThreadRead } from "./queue";

import {
  didExternalEntityFinish,
  fanOutEntityFinished,
  isExternalEntityFinished,
  type ExternalEntityFinishState,
} from "./entity-finished";

vi.mock("./queue", () => ({ enqueueThreadRead: vi.fn() }));

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
  it("recognizes closed issues and merged pull requests", () => {
    expect(isExternalEntityFinished(issue("closed"))).toBe(true);
    expect(isExternalEntityFinished(pullRequest("closed", true))).toBe(true);
  });

  it("does not treat a closed unmerged pull request as finished", () => {
    expect(isExternalEntityFinished(pullRequest("closed", false))).toBe(false);
  });

  it("only emits a transition for a previously known unfinished entity", () => {
    expect(didExternalEntityFinish(issue("open"), issue("closed"))).toBe(true);
    expect(didExternalEntityFinish(null, issue("closed"))).toBe(false);
    expect(didExternalEntityFinish(issue("closed"), issue("closed"))).toBe(
      false
    );
  });

  it("fans out the entity payload only to linked live threads", async () => {
    vi.mocked(enqueueThreadRead).mockResolvedValue({
      disposition: "scheduled",
      jobId: "thread:live:read",
    });
    const db = {
      find: vi.fn().mockResolvedValue({
        closed: { id: "closed", status: 2 },
        live: { id: "live", status: 1 },
      }),
    } as unknown as Parameters<typeof fanOutEntityFinished>[0];

    const result = await fanOutEntityFinished(db, issue("closed"));

    expect(enqueueThreadRead).toHaveBeenCalledOnce();
    expect(enqueueThreadRead).toHaveBeenCalledWith("live", {
      entityFinished: {
        externalKey: "github:acme/app#1",
        type: "issue",
        url: "https://github.com/acme/app/issues/1",
      },
      kind: "entity_finished",
      organizationId: "org-1",
    });
    expect(result).toEqual({
      enqueued: 1,
      jobIds: ["thread:live:read"],
      unavailable: 0,
    });
  });
});
