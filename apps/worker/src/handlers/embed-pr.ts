import { google } from "@ai-sdk/google";
import { embed, generateText, Output } from "ai";
import { createHash } from "node:crypto";
import type { Job } from "bullmq";
import {
  createAILogger,
  createEvlogIntegration,
  createLogger,
  log,
} from "@workspace/utils/logging";
import z from "zod";
import { AI_PRICING } from "../lib/ai-pricing";
import { type PrPayload, upsertPrVector } from "../lib/qdrant/pull-requests";
import { matchPrToThreads } from "./match-pr-threads";

const EMBEDDING_MODEL = "gemini-embedding-001";
const embeddingModel = google.embedding(EMBEDDING_MODEL);
const MAX_TEXT_LENGTH = 10_000;
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 10000;

export interface EmbedPrJobData {
  prId: number;
  prNumber: number;
  owner: string;
  repo: string;
  prUrl: string;
  prTitle: string;
  prBody: string;
  commitMessages: string[];
  organizationId: string;
  mergedAt: string;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const isRateLimitError = (error: unknown): boolean => {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("overloaded") ||
      message.includes("rate limit") ||
      message.includes("too many requests") ||
      message.includes("quota") ||
      message.includes("429")
    );
  }
  return false;
};

const isRetryableError = (error: unknown): boolean => {
  if (error instanceof Error) {
    const errorName = error.constructor.name;
    const message = error.message.toLowerCase();

    if (
      errorName.includes("RetryError") ||
      errorName.includes("NoObjectGeneratedError") ||
      errorName.includes("APIError") ||
      message.includes("timeout") ||
      message.includes("network") ||
      message.includes("connection") ||
      isRateLimitError(error)
    ) {
      return true;
    }
  }
  return false;
};

const getRetryDelay = (attempt: number, isRateLimit: boolean): number => {
  const baseDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
  const delay = isRateLimit ? baseDelay * 2 : baseDelay;
  return Math.min(delay, MAX_RETRY_DELAY_MS);
};

const prSummarySchema = z.object({
  shortDescription: z
    .string()
    .describe(
      "What this PR fixes or changes, in 2-3 sentences. Focus on the user-facing impact, not implementation details.",
    ),
  keywords: z
    .array(z.string())
    .max(7)
    .describe(
      "Canonical terms identifying what was fixed or changed. Use normalized vocabulary that would match how a user would describe the issue in a support thread. Max 5-7 terms.",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "How confident you are (0.0–1.0) that the summary accurately captures a specific, user-facing issue that could be matched against a support thread. Score LOW (< 0.3) if: the PR is purely internal (CI, refactoring, dependency bumps), the title/description is too vague to determine what changed, or there is no discernible user-facing impact. Score HIGH (> 0.7) if: the PR clearly describes a user-facing bug fix or feature change, and you can articulate what a user would have reported.",
    ),
});

const MIN_SUMMARIZATION_CONFIDENCE = 0.4;

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
};

/**
 * Build the text payload from PR data, truncated to MAX_TEXT_LENGTH
 */
export const buildPrText = (data: EmbedPrJobData): string => {
  const parts: string[] = [
    `Title: ${data.prTitle}`,
    "",
    `Description: ${data.prBody || "No description provided."}`,
  ];

  if (data.commitMessages.length > 0) {
    parts.push("", "Commit messages:");
    for (const msg of data.commitMessages) {
      parts.push(`- ${msg}`);
    }
  }

  const text = parts.join("\n");
  if (text.length > MAX_TEXT_LENGTH) {
    return `${text.slice(0, MAX_TEXT_LENGTH)}...`;
  }
  return text;
};

/**
 * Summarize PR content via Gemini for semantic matching against support threads
 */
export const summarizePr = async (
  prText: string,
  ai?: ReturnType<typeof createAILogger>,
  requestLog?: ReturnType<typeof createLogger>,
): Promise<z.infer<typeof prSummarySchema>> => {
  const localRequestLog = requestLog ?? createLogger({ action: "summarize-pr" });
  const localAi = ai ?? createAILogger(localRequestLog, { cost: AI_PRICING });

  const prompt = `
You are analyzing a merged pull request to determine what user-facing issue it fixes or what change it introduces. Your output will be used to match this PR against open support threads.

## PR Content
${prText}

## Instructions

Focus on the USER-FACING IMPACT of this PR, not the implementation details:
- What problem does this fix from the user's perspective?
- How would a user have described this problem in a support thread?
- Use normalized, canonical terminology (e.g., "recording freezes" not "event listener blocks stream")

Do NOT:
- Include implementation details (file names, function names, variable names)
- Describe the PR process itself ("this PR fixes...", "merged by...")
- Include version numbers or commit SHAs

## Confidence scoring
Rate your confidence that this summary could be used to match a user's support thread:
- 0.0–0.3: No user-facing signal. The PR is purely internal (CI, infra, deps, refactoring) OR the title/description is too vague to determine what changed (e.g., "misc fixes" with no body).
- 0.3–0.7: Partial signal. Some user impact can be inferred but the description is ambiguous or heavily implementation-focused.
- 0.7–1.0: Clear user-facing problem or feature described. You can confidently articulate what a user would have reported.
`;

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { output } = await generateText({
        model: localAi.wrap("anthropic/claude-sonnet-4.6"),
        output: Output.object({ schema: prSummarySchema }),
        prompt,
        experimental_telemetry: {
          isEnabled: true,
          integrations: [createEvlogIntegration(localAi)],
        },
      });

      return output;
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === MAX_RETRIES - 1;
      const isRetryable = isRetryableError(error);
      const isRateLimit = isRateLimitError(error);

      if (!isRetryable) {
        throw error;
      }

      if (isLastAttempt) {
        throw error;
      }

      const delay = getRetryDelay(attempt, isRateLimit);
      localRequestLog.warn(
        `PR summary attempt ${attempt + 1}/${MAX_RETRIES} failed (${isRateLimit ? "rate limit" : "retryable"} error), retrying in ${delay}ms...`,
      );

      await sleep(delay);
    }
  }

  throw lastError || new Error("Failed to summarize PR");
};

/**
 * Generate an embedding vector from text
 */
const generatePrEmbedding = async (
  text: string,
  ai: ReturnType<typeof createAILogger>,
  requestLog: ReturnType<typeof createLogger>,
): Promise<number[] | null> => {
  if (!text || text.trim().length === 0) {
    return null;
  }

  try {
    const { embedding, usage } = await embed({
      model: embeddingModel,
      value: text,
      providerOptions: {
        google: {
          taskType: "SEMANTIC_SIMILARITY",
        },
      },
    });
    ai.captureEmbed({
      usage,
      model: EMBEDDING_MODEL,
      dimensions: embedding.length,
      count: 1,
    });

    // L2 normalize
    const norm = Math.hypot(...embedding);

    if (!Number.isFinite(norm) || norm === 0) {
      requestLog.warn(
        `PR embedding normalization failed: invalid norm (${norm})`,
      );
      return embedding;
    }

    return embedding.map((value) => value / norm);
  } catch (error) {
    requestLog.error(`Error generating PR embedding: ${formatError(error)}`);
    return null;
  }
};

/**
 * Generate a deterministic UUID from a string key
 */
const deterministicPointId = (key: string): string => {
  const hash = createHash("sha256").update(key).digest("hex");
  // Format as UUID v4-like structure from hash
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
};

/**
 * Handle an embed-pr BullMQ job
 */
export const handleEmbedPr = async (job: Job<EmbedPrJobData>) => {
  const data = job.data;
  const prRef = `${data.owner}/${data.repo}#${data.prNumber}`;
  const requestLog = createLogger({
    action: "embed-pr",
    queue: "embed-pr",
    jobId: String(job.id ?? "unknown"),
    prRef,
    organizationId: data.organizationId,
  });
  const ai = createAILogger(requestLog, { cost: AI_PRICING });
  let status = 200;

  try {
    log.info("worker.embed-pr", `Processing job ${job.id}: ${prRef}`);
    requestLog.info(`Processing job ${job.id}: ${prRef}`);

    // 1. Build text payload
    const prText = buildPrText(data);
    log.info(
      "worker.embed-pr",
      `Built text payload for ${prRef} (${prText.length} chars)`,
    );
    requestLog.set({
      pr: {
        ref: prRef,
        textLength: prText.length,
      },
    });

    // 2. Summarize via AI SDK + evlog AI middleware
    const summary = await summarizePr(prText, ai, requestLog);
    log.info(
      "worker.embed-pr",
      `Summarized ${prRef} (confidence: ${summary.confidence.toFixed(2)}): "${summary.shortDescription.slice(0, 80)}..."`,
    );
    requestLog.set({
      pr: {
        summaryConfidence: summary.confidence,
        summaryKeywordsCount: summary.keywords.length,
      },
    });

    // 3. Skip embedding if confidence is too low
    if (summary.confidence < MIN_SUMMARIZATION_CONFIDENCE) {
      log.info(
        "worker.embed-pr",
        `⏭️ Skipping embedding for ${prRef}: confidence ${summary.confidence.toFixed(2)} < ${MIN_SUMMARIZATION_CONFIDENCE} threshold`,
      );
      requestLog.info(
        `Skipped embedding for ${prRef}: confidence ${summary.confidence.toFixed(2)} below threshold ${MIN_SUMMARIZATION_CONFIDENCE}`,
      );
      return {
        prRef,
        pointId: null,
        shortDescription: summary.shortDescription,
        keywords: summary.keywords,
        confidence: summary.confidence,
        skipped: true,
      };
    }

    // 4. Build embedding text from summary + title
    const embeddingText = [
      `title: ${data.prTitle}`,
      `shortDescription: ${summary.shortDescription}`,
      `keywords: ${summary.keywords.join(", ")}`,
    ].join("\n");

    // 5. Generate embedding (+ capture embedding usage)
    const embedding = await generatePrEmbedding(embeddingText, ai, requestLog);
    if (!embedding) {
      throw new Error(`Failed to generate embedding for ${prRef}`);
    }

    // 6. Build payload and upsert
    const payload: PrPayload = {
      prNumber: data.prNumber,
      owner: data.owner,
      repo: data.repo,
      prUrl: data.prUrl,
      prTitle: data.prTitle,
      shortDescription: summary.shortDescription,
      keywords: summary.keywords,
      organizationId: data.organizationId,
      mergedAt: new Date(data.mergedAt).getTime(),
      confidence: summary.confidence,
    };

    const pointId = deterministicPointId(
      `pr:${data.organizationId}:${data.owner}/${data.repo}#${data.prNumber}`,
    );

    const stored = await upsertPrVector(pointId, embedding, payload);
    if (!stored) {
      throw new Error(`Failed to store PR vector for ${prRef} in Qdrant`);
    }

    log.info(
      "worker.embed-pr",
      `Embedded and stored ${prRef} in Qdrant (pointId: ${pointId})`,
    );

    // 7. Match against open threads and create suggestions
    const matchResult = await matchPrToThreads({
      embedding,
      organizationId: data.organizationId,
      prId: data.prId,
      prNumber: data.prNumber,
      prTitle: data.prTitle,
      prUrl: data.prUrl,
      owner: data.owner,
      repo: data.repo,
      shortDescription: summary.shortDescription,
      confidence: summary.confidence,
    });

    log.info(
      "worker.embed-pr",
      `🔗 Thread matching for ${prRef}: ${matchResult.suggestionsCreated} suggestions, ${matchResult.skippedAlreadyLinked} skipped (already linked), ${matchResult.skippedLowConfidence} skipped (low LLM confidence)`,
    );
    requestLog.set({
      pr: {
        pointId,
        suggestionsCreated: matchResult.suggestionsCreated,
        skippedAlreadyLinked: matchResult.skippedAlreadyLinked,
        skippedLowConfidence: matchResult.skippedLowConfidence,
      },
    });

    return {
      prRef,
      pointId,
      shortDescription: summary.shortDescription,
      keywords: summary.keywords,
      confidence: summary.confidence,
      skipped: false,
      matchedThreadIds: matchResult.matchedThreadIds,
      suggestionsCreated: matchResult.suggestionsCreated,
    };
  } catch (error) {
    status = 500;
    requestLog.error(`Embed PR job failed: ${formatError(error)}`);
    throw error;
  } finally {
    requestLog.emit({ status });
  }
};
