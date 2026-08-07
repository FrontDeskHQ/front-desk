import { generateSimilarityEmbedding } from "./entity-embedding";
import type { WorkerLogger } from "./logging";

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

/** Embed a PR in the shared similarity space (see `entity-embedding`). */
export const generatePrEmbedding = async (
  text: string,
  requestLog?: WorkerLogger
): Promise<number[] | null> => generateSimilarityEmbedding(text, requestLog);
