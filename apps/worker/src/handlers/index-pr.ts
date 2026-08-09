import { createHash } from "node:crypto";

import type { PrIndexJobData } from "@workspace/schemas/signals";
import type { Job } from "bullmq";

import { createWorkerJobLogger, isRetryableError } from "../lib/logging";
import { buildPrEmbedText, generatePrEmbedding } from "../lib/pr-embedding";
import { prIndex } from "../lib/qdrant/pull-requests";
import type { PrPayload } from "../lib/qdrant/pull-requests";

const computeSha256 = (data: string): string =>
  createHash("sha256").update(data).digest("hex");

/**
 * Index-only handler for the `pr-index` queue (FRO-203). Keeps the PR vector
 * index in step with the mirror: embeds eligible (open, non-draft) PRs, marks
 * closed / draft PRs `eligible: false` so they drop out of search, and removes
 * the point when the mirror row is deleted. Never fans out `pr_matched` reads.
 *
 * Re-embedding is skipped when the embed-relevant content (title + body + head
 * ref) is unchanged: a pure eligibility flip (close / reopen / draft /
 * ready_for_review) just updates the payload flag.
 */
export const handleIndexPr = async (job: Job<PrIndexJobData>) => {
  const { data } = job;
  const { externalKey, organizationId } = data;
  const requestLog = createWorkerJobLogger("pr-index", job, "pr.index", {
    pr: data.deleted
      ? { externalKey, organizationId, deleted: true }
      : {
          externalKey,
          organizationId,
          provider: data.provider,
          repoFullName: data.repoFullName,
          number: data.number,
          state: data.state,
          draft: data.draft ?? false,
          deleted: false,
        },
  });
  let status = 200;

  try {
    // Mirror row removed: drop the vector and stop.
    if (data.deleted) {
      await prIndex.remove({ externalKey, organizationId });
      requestLog.set({ outcome: { action: "deleted", vectorDeleted: true } });
      return { action: "deleted" as const, externalKey };
    }

    const eligible = data.state === "open" && data.draft !== true;
    const existing = await prIndex.get({ externalKey, organizationId });
    requestLog.set({
      pr: {
        eligible,
        existingIndex: Boolean(existing),
      },
    });

    // Ineligible and never indexed — nothing searchable to store or exclude.
    if (!eligible && !existing) {
      requestLog.set({
        outcome: {
          action: "skipped",
          reason: "ineligible_and_not_indexed",
        },
      });
      return { action: "skipped" as const, externalKey };
    }

    const embedText = buildPrEmbedText(data);
    const contentHash = computeSha256(embedText);
    const now = Date.now();

    // Content unchanged since the last index: no re-embed needed. Flip the
    // eligibility flag (and refresh updatedAt) on the existing point in place.
    if (existing && existing.contentHash === contentHash) {
      await prIndex.patch(
        { externalKey, organizationId },
        { eligible, updatedAt: now }
      );
      requestLog.set({
        outcome: {
          action: "eligibility",
          contentChanged: false,
          eligible,
          reembedded: false,
        },
      });
      return { action: "eligibility" as const, eligible, externalKey };
    }

    // New PR or edited content: embed and upsert the full point.
    const embedding = await generatePrEmbedding(embedText, requestLog);
    if (!embedding) {
      throw new Error(`Failed to embed PR ${externalKey}`);
    }

    const payload: PrPayload = {
      contentHash,
      eligible,
      externalEntityId: data.externalEntityId,
      externalKey,
      headRef: data.headRef,
      number: data.number,
      organizationId,
      provider: data.provider,
      repoFullName: data.repoFullName,
      title: data.title,
      updatedAt: now,
      url: data.url,
    };

    await prIndex.upsert({ payload, vector: embedding });

    requestLog.set({
      outcome: {
        action: "indexed",
        contentChanged: true,
        eligible,
        embeddingDimensions: embedding.length,
        reembedded: true,
        stored: true,
      },
    });
    return { action: "indexed" as const, eligible, externalKey };
  } catch (error) {
    status = 500;
    requestLog.error(error instanceof Error ? error : String(error), {
      step: "pr.index",
      retryable: isRetryableError(error),
    });
    throw error;
  } finally {
    requestLog.emit({ status });
  }
};
