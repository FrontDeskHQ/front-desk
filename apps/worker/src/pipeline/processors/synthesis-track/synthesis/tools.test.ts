import type { Thread } from "../../../../types";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchThreadWithRelations } from "../../../../lib/database/client";
import { createSynthesisTools } from "./tools";

vi.mock("../../../../lib/database/client", () => ({
  fetchMirroredIssueByUrl: vi.fn(),
  fetchMirroredPrByUrl: vi.fn(),
  fetchThreadWithRelations: vi.fn(),
}));

const mockedFetchThreadWithRelations = vi.mocked(fetchThreadWithRelations);

const makeThread = (deletedAt: Date | null): Thread =>
  ({
    deletedAt,
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

    expect(result).toEqual({
      found: false,
      reason: "not_found",
    });
  });
});
