import type { PrMatchJobData } from "@workspace/schemas/signals";
import { log } from "@workspace/utils/logging";
import type { Job } from "bullmq";
import { fetchClient } from "../lib/database/client";
import { buildPrEmbedText, generatePrEmbedding } from "../lib/pr-embedding";
import { PR_MATCH_THRESHOLD } from "../lib/qdrant/pull-requests";
import { searchSimilarThreads } from "../lib/qdrant/threads";

/** Open (0) and In progress (1) — the only threads a PR match may light up. */
const ACTIVE_STATUSES = [0, 1];

/** How many similar threads to consider per PR match. */
const MATCH_LIMIT = 10;

/**
 * Push-side PR↔thread discovery (FRO-205). A GitHub webhook enqueues this when
 * an eligible PR opens / reopens / becomes ready-for-review / is edited. The
 * handler embeds the PR, searches for similar Open / In-progress threads, and
 * hands the candidates to the API, which filters to *unlinked* threads and fans
 * out one `pr_matched` thread read per match (ADR 0006 trigger channel).
 *
 * Eligibility (open, non-draft) is re-derived here from `state` / `draft` rather
 * than trusted from the enqueue, so a job that raced a since-closed / re-drafted
 * PR is dropped instead of matching a dead PR.
 */
export const handleMatchPr = async (job: Job<PrMatchJobData>) => {
  const data = job.data;
  const { organizationId, externalKey } = data;

  const eligible = data.state === "open" && data.draft !== true;
  if (!eligible) {
    log.info(
      "worker.match-pr",
      `Skipped ineligible PR ${externalKey} (state=${data.state}, draft=${data.draft})`,
    );
    return { externalKey, action: "skipped" as const };
  }

  const embedText = buildPrEmbedText(data);
  const embedding = await generatePrEmbedding(embedText);
  if (!embedding) {
    throw new Error(`Failed to embed PR ${externalKey}`);
  }

  const matches = await searchSimilarThreads(embedding, {
    organizationId,
    statusFilter: ACTIVE_STATUSES,
    scoreThreshold: PR_MATCH_THRESHOLD,
    limit: MATCH_LIMIT,
  });

  if (matches.length === 0) {
    log.info("worker.match-pr", `No similar threads for PR ${externalKey}`);
    return { externalKey, action: "matched" as const, enqueued: 0 };
  }

  // The API owns the authoritative unlinked-thread filter (the vector payload's
  // status can lag the mirror) and the thread-read enqueue with its ADR-0006
  // coalescing, so hand it the raw candidates and let it fan out.
  const { enqueued } = await fetchClient.mutate.externalEntity.fanOutPrMatch({
    organizationId,
    externalKey,
    matches: matches.map((m) => ({ threadId: m.threadId, score: m.score })),
  });

  log.info(
    "worker.match-pr",
    `PR ${externalKey}: ${matches.length} similar thread(s), ${enqueued} pr_matched read(s) enqueued`,
  );
  return { externalKey, action: "matched" as const, enqueued };
};
