import { createHash } from "node:crypto";
import type { PrIndexJobData } from "@workspace/schemas/signals";
import { log } from "@workspace/utils/logging";
import type { Job } from "bullmq";
import { buildPrEmbedText, generatePrEmbedding } from "../lib/pr-embedding";
import {
  deletePrVector,
  getPrPoint,
  type PrPayload,
  setPrEligibility,
  upsertPrVector,
} from "../lib/qdrant/pull-requests";

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
  const data = job.data;
  const { externalKey, organizationId } = data;

  // Mirror row removed: drop the vector and stop.
  if (data.deleted) {
    await deletePrVector(organizationId, externalKey);
    log.info("worker.pr-index", `Deleted PR vector ${externalKey}`);
    return { externalKey, action: "deleted" as const };
  }

  const eligible = data.state === "open" && data.draft !== true;
  const existing = await getPrPoint(organizationId, externalKey);

  // Ineligible and never indexed — nothing searchable to store or exclude.
  if (!eligible && !existing) {
    log.info(
      "worker.pr-index",
      `Skipped ineligible, unindexed PR ${externalKey}`,
    );
    return { externalKey, action: "skipped" as const };
  }

  const embedText = buildPrEmbedText(data);
  const contentHash = computeSha256(embedText);
  const now = Date.now();

  // Content unchanged since the last index: no re-embed needed. Flip the
  // eligibility flag (and refresh updatedAt) on the existing point in place.
  if (existing && existing.payload.contentHash === contentHash) {
    await setPrEligibility(organizationId, externalKey, eligible, now);
    log.info(
      "worker.pr-index",
      `Refreshed PR ${externalKey} eligibility=${eligible} (no re-embed)`,
    );
    return { externalKey, action: "eligibility" as const, eligible };
  }

  // New PR or edited content: embed and upsert the full point.
  const embedding = await generatePrEmbedding(embedText);
  if (!embedding) {
    throw new Error(`Failed to embed PR ${externalKey}`);
  }

  const payload: PrPayload = {
    externalKey,
    externalEntityId: data.externalEntityId,
    organizationId,
    provider: data.provider,
    repoFullName: data.repoFullName,
    number: data.number,
    url: data.url,
    title: data.title,
    headRef: data.headRef,
    eligible,
    contentHash,
    updatedAt: now,
  };

  const stored = await upsertPrVector(embedding, payload);
  if (!stored) {
    throw new Error(`Failed to store PR vector ${externalKey}`);
  }

  log.info("worker.pr-index", `Indexed PR ${externalKey} eligible=${eligible}`);
  return { externalKey, action: "indexed" as const, eligible };
};
