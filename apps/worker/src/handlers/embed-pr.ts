import { google } from "@ai-sdk/google";
import { embed, generateText, Output } from "ai";
import { createHash } from "node:crypto";
import type { Job } from "bullmq";
import z from "zod";
import { type PrPayload, upsertPrVector } from "../lib/qdrant/pull-requests";

const EMBEDDING_MODEL = "gemini-embedding-001";
const embeddingModel = google.embedding(EMBEDDING_MODEL);
const MAX_TEXT_LENGTH = 10_000;
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 10000;

export interface EmbedPrJobData {
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
): Promise<z.infer<typeof prSummarySchema>> => {
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
        model: google("gemini-3-flash-preview"),
        output: Output.object({ schema: prSummarySchema }),
        prompt,
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
      console.warn(
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
): Promise<number[] | null> => {
  if (!text || text.trim().length === 0) {
    return null;
  }

  try {
    const { embedding } = await embed({
      model: embeddingModel,
      value: text,
      providerOptions: {
        google: {
          taskType: "SEMANTIC_SIMILARITY",
        },
      },
    });

    // L2 normalize
    const norm = Math.hypot(...embedding);

    if (!Number.isFinite(norm) || norm === 0) {
      console.warn("PR embedding normalization failed: invalid norm", norm);
      return embedding;
    }

    return embedding.map((value) => value / norm);
  } catch (error) {
    console.error("Error generating PR embedding:", error);
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

  console.log(`\n📥 Embed-pr job ${job.id}: Processing ${prRef}`);

  // 1. Build text payload
  const prText = buildPrText(data);
  console.log(
    `Built text payload for ${prRef} (${prText.length} chars)`,
  );

  // 2. Summarize via Gemini
  const summary = await summarizePr(prText);
  console.log(
    `Summarized ${prRef} (confidence: ${summary.confidence.toFixed(2)}): "${summary.shortDescription.slice(0, 80)}..."`,
  );

  // 3. Skip embedding if confidence is too low
  if (summary.confidence < MIN_SUMMARIZATION_CONFIDENCE) {
    console.log(
      `⏭️ Skipping embedding for ${prRef}: confidence ${summary.confidence.toFixed(2)} < ${MIN_SUMMARIZATION_CONFIDENCE} threshold`,
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

  // 5. Generate embedding
  const embedding = await generatePrEmbedding(embeddingText);
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

  console.log(`✅ Embedded and stored ${prRef} in Qdrant (pointId: ${pointId})`);

  return {
    prRef,
    pointId,
    shortDescription: summary.shortDescription,
    keywords: summary.keywords,
    confidence: summary.confidence,
    skipped: false,
  };
};
