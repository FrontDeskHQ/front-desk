import { createHash } from "node:crypto";

import type { IssueIndexJobData } from "@workspace/schemas/signals";
import type { Job } from "bullmq";

import {
  buildIssueEmbedText,
  generateIssueEmbedding,
} from "../lib/issue-embedding";
import { createWorkerJobLogger, isRetryableError } from "../lib/logging";
import {
  deleteIssueVector,
  getIssuePoint,
  setIssueState,
  upsertIssueVector,
} from "../lib/qdrant/issues";
import type { IssuePayload } from "../lib/qdrant/issues";

const computeSha256 = (data: string): string =>
  createHash("sha256").update(data).digest("hex");

/**
 * Index-only handler for the `issue-index` queue (FRO-217). Keeps the issue
 * vector index in step with the mirror and removes the point when the mirror
 * row is deleted. Never fans out thread reads — there is no `issue_matched`
 * trigger.
 *
 * Unlike `pr-index` there is no eligibility gate: a closed issue stays indexed,
 * because it is often the most useful thing a thread can link to. A close /
 * reopen therefore just refreshes the stored `state` instead of dropping the
 * issue out of search. Re-embedding is skipped when title + body are unchanged.
 */
export const handleIndexIssue = async (job: Job<IssueIndexJobData>) => {
  const { data } = job;
  const { externalKey, organizationId } = data;
  const requestLog = createWorkerJobLogger("issue-index", job, "issue.index", {
    issue: data.deleted
      ? { externalKey, organizationId, deleted: true }
      : {
          externalKey,
          organizationId,
          provider: data.provider,
          repoFullName: data.repoFullName,
          number: data.number,
          state: data.state,
          deleted: false,
        },
  });
  let status = 200;

  try {
    // Mirror row removed: drop the vector and stop.
    if (data.deleted) {
      const deleted = await deleteIssueVector(organizationId, externalKey);
      if (!deleted) {
        throw new Error(`Failed to delete issue vector ${externalKey}`);
      }
      requestLog.set({ outcome: { action: "deleted", vectorDeleted: true } });
      return { action: "deleted" as const, externalKey };
    }

    const existing = await getIssuePoint(organizationId, externalKey);
    requestLog.set({ issue: { existingIndex: Boolean(existing) } });

    const embedText = buildIssueEmbedText(data);
    const contentHash = computeSha256(embedText);
    const now = Date.now();

    // Content unchanged since the last index: no re-embed needed. Refresh the
    // stored state (and updatedAt) on the existing point in place.
    if (existing && existing.payload.contentHash === contentHash) {
      const updated = await setIssueState(
        organizationId,
        externalKey,
        data.state,
        now
      );
      if (!updated) {
        throw new Error(`Failed to update issue state ${externalKey}`);
      }
      requestLog.set({
        outcome: {
          action: "state",
          contentChanged: false,
          reembedded: false,
          state: data.state,
        },
      });
      return { action: "state" as const, externalKey, state: data.state };
    }

    // New issue or edited content: embed and upsert the full point.
    const embedding = await generateIssueEmbedding(embedText, requestLog);
    if (!embedding) {
      throw new Error(`Failed to embed issue ${externalKey}`);
    }

    const payload: IssuePayload = {
      contentHash,
      externalEntityId: data.externalEntityId,
      externalKey,
      number: data.number,
      organizationId,
      provider: data.provider,
      repoFullName: data.repoFullName,
      state: data.state,
      title: data.title,
      updatedAt: now,
      url: data.url,
    };

    const stored = await upsertIssueVector(embedding, payload);
    if (!stored) {
      throw new Error(`Failed to store issue vector ${externalKey}`);
    }

    requestLog.set({
      outcome: {
        action: "indexed",
        contentChanged: true,
        embeddingDimensions: embedding.length,
        reembedded: true,
        state: data.state,
        stored: true,
      },
    });
    return { action: "indexed" as const, externalKey, state: data.state };
  } catch (error) {
    status = 500;
    requestLog.error(error instanceof Error ? error : String(error), {
      step: "issue.index",
      retryable: isRetryableError(error),
    });
    throw error;
  } finally {
    requestLog.emit({ status });
  }
};
