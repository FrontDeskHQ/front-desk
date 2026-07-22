import { google } from "@ai-sdk/google";
import { embed } from "ai";

const EMBEDDING_MODEL = "gemini-embedding-001";
const embeddingModel = google.embedding(EMBEDDING_MODEL);

/** The subset of a PR needed to build its embed text. */
export interface PrEmbedInput {
  title: string;
  body: string | null;
  headRef: string | null;
}

/**
 * Text embedded for PR similarity: title + body + head ref (design lock,
 * FRO-201). The head ref (branch name) is a strong, terse signal
 * (e.g. `fix/oauth-token-refresh`) worth its own line. Shared by the index-only
 * (`pr-index`) and push-side (`match-pr`) paths so both embed identically.
 */
export const buildPrEmbedText = (data: PrEmbedInput): string =>
  [
    `title: ${data.title}`,
    data.body ? `body: ${data.body}` : null,
    data.headRef ? `head: ${data.headRef}` : null,
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

/**
 * Generate a normalized embedding vector. Uses SEMANTIC_SIMILARITY (matching the
 * thread index) so PR and thread vectors live in a comparable space for
 * cross-searches.
 */
export const generatePrEmbedding = async (
  text: string
): Promise<number[] | null> => {
  if (!text || text.trim().length === 0) {
    return null;
  }

  const { embedding } = await embed({
    model: embeddingModel,
    providerOptions: {
      google: { taskType: "SEMANTIC_SIMILARITY" },
    },
    value: text,
  });

  const norm = Math.hypot(...embedding);
  if (!Number.isFinite(norm) || norm === 0) {
    console.warn("PR embedding normalization failed: invalid norm", norm);
    return embedding;
  }
  return embedding.map((value) => value / norm);
};
