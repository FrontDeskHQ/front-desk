import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  fetchMirroredIssueByUrl,
  fetchMirroredPrByUrl,
} from "../../../../lib/database/client";
import { fetchThreadWithRelations } from "../../../../lib/database/client";
import type { Thread } from "../../../../types";
import { createSynthesisTools } from "./tools";

vi.mock(import("../../../../lib/database/client"), () => ({
  fetchMirroredIssueByUrl: vi.fn<typeof fetchMirroredIssueByUrl>(),
  fetchMirroredPrByUrl: vi.fn<typeof fetchMirroredPrByUrl>(),
  fetchThreadWithRelations: vi.fn<typeof fetchThreadWithRelations>(),
}));

const mockedFetchThreadWithRelations = vi.mocked(fetchThreadWithRelations);

const makeThread = (deletedAt: Date | null): Thread =>
  ({
    deletedAt,
    externalIssueId: "github:acme/app#42",
    externalPrId: "github:acme/app#43",
    id: "target-thread",
    messages: [],
    name: "Target thread",
    organizationId: "org-a",
    status: 0,
  }) as unknown as Thread;

describe("synthesis read_thread", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not expose a deleted target thread", async () => {
    mockedFetchThreadWithRelations.mockResolvedValue(
      makeThread(new Date("2026-08-11T12:00:00.000Z"))
    );

    const tools = createSynthesisTools({
      currentThread: makeThread(null),
      currentThreadId: "current-thread",
      organizationId: "org-a",
    });

    const executeReadThread = tools.read_thread.execute as unknown as (input: {
      threadId: string;
    }) => Promise<unknown>;
    const result = await executeReadThread({
      threadId: "target-thread",
    });

    expect(result).toStrictEqual({
      found: false,
      reason: "not_found",
    });
  });

  it("exposes the thread's current external links", async () => {
    const thread = makeThread(null);
    mockedFetchThreadWithRelations.mockResolvedValue(thread);

    const tools = createSynthesisTools({
      currentThread: makeThread(null),
      currentThreadId: "current-thread",
      organizationId: "org-a",
    });

    const executeReadThread = tools.read_thread.execute as unknown as (input: {
      threadId: string;
    }) => Promise<unknown>;

    await expect(
      executeReadThread({ threadId: "target-thread" })
    ).resolves.toMatchObject({
      found: true,
      thread: {
        linkedEntities: {
          issueExternalKey: "github:acme/app#42",
          pullRequestExternalKey: "github:acme/app#43",
        },
      },
    });
  });
});
