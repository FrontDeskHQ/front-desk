import type { IssueIndexJobData } from "@workspace/schemas/signals";
import type { Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildIssueEmbedText: vi.fn<(...args: unknown[]) => string>(),
  createWorkerJobLogger: vi.fn<
    (...args: unknown[]) => {
      emit: (...args: unknown[]) => void;
      error: (...args: unknown[]) => void;
      set: (...args: unknown[]) => void;
    }
  >(),
  fetchClient: {
    query: {
      externalEntity: {
        issueIndexSnapshot: vi.fn<
          (...args: unknown[]) => Promise<{
            data?: IssueIndexJobData;
            deleted: boolean;
          }>
        >(),
      },
    },
  },
  generateIssueEmbedding:
    vi.fn<(...args: unknown[]) => Promise<number[] | null>>(),
  isRetryableError: vi.fn<(...args: unknown[]) => boolean>(),
  issueIndex: {
    get: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    patch: vi.fn<(...args: unknown[]) => Promise<void>>(),
    remove: vi.fn<(...args: unknown[]) => Promise<void>>(),
    upsert: vi.fn<(...args: unknown[]) => Promise<void>>(),
  },
}));

vi.mock(import("../lib/database/client"), () => ({
  fetchClient: mocks.fetchClient as never,
}));
vi.mock(import("../lib/issue-embedding"), () => ({
  buildIssueEmbedText: mocks.buildIssueEmbedText,
  generateIssueEmbedding: mocks.generateIssueEmbedding,
}));
vi.mock(import("../lib/logging"), () => ({
  createWorkerJobLogger: mocks.createWorkerJobLogger as never,
  isRetryableError: mocks.isRetryableError,
}));
vi.mock(import("../lib/qdrant/issues"), () => ({
  issueIndex: mocks.issueIndex as never,
}));

import { handleIndexIssue } from "./index-issue";

const deletedData: IssueIndexJobData = {
  deleted: true,
  externalEntityId: "entity-1",
  externalKey: "linear:issue-1",
  organizationId: "org-1",
};

const restoredData: IssueIndexJobData = {
  body: "The restored issue body",
  containerLabel: "ENG",
  externalEntityId: "entity-1",
  externalKey: "linear:issue-1",
  number: 1,
  organizationId: "org-1",
  provider: "linear",
  repoFullName: "ENG",
  shortId: "ENG-1",
  state: "open",
  title: "Restored issue",
  url: "https://linear.app/acme/issue/ENG-1/restored-issue",
};

const job = (data: IssueIndexJobData) =>
  ({ data, id: "issue-index-job" }) as unknown as Job<IssueIndexJobData>;

describe(handleIndexIssue, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildIssueEmbedText.mockReturnValue("Restored issue");
    mocks.createWorkerJobLogger.mockReturnValue({
      emit: vi.fn<(...args: unknown[]) => void>(),
      error: vi.fn<(...args: unknown[]) => void>(),
      set: vi.fn<(...args: unknown[]) => void>(),
    });
    mocks.generateIssueEmbedding.mockResolvedValue([0.1]);
    mocks.isRetryableError.mockReturnValue(false);
    mocks.issueIndex.get.mockResolvedValue(null);
    mocks.issueIndex.remove.mockResolvedValue(undefined);
    mocks.issueIndex.upsert.mockResolvedValue(undefined);
  });

  it("re-indexes when a restore becomes visible during deletion", async () => {
    mocks.fetchClient.query.externalEntity.issueIndexSnapshot
      .mockResolvedValueOnce({ deleted: true })
      .mockResolvedValueOnce({ data: restoredData, deleted: false });

    await expect(handleIndexIssue(job(deletedData))).resolves.toMatchObject({
      action: "indexed",
      externalKey: "linear:issue-1",
    });

    expect(mocks.issueIndex.remove).toHaveBeenCalledWith({
      externalKey: "linear:issue-1",
      organizationId: "org-1",
    });
    expect(mocks.issueIndex.upsert).toHaveBeenCalledOnce();
    expect(
      mocks.fetchClient.query.externalEntity.issueIndexSnapshot
    ).toHaveBeenCalledTimes(2);
  });
});
