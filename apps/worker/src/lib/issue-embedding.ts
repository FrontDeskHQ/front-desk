import { generateSimilarityEmbedding } from "./entity-embedding";
import type { WorkerLogger } from "./logging";

/** The subset of an issue needed to build its embed text. */
export interface IssueEmbedInput {
  title: string;
  body: string | null;
}

/**
 * Text embedded for issue similarity: title + body. No third line to match the
 * PR text's head ref — an issue has no branch, and its title/body already carry
 * the problem statement that a thread is matched against.
 */
export const buildIssueEmbedText = (data: IssueEmbedInput): string =>
  [`title: ${data.title}`, data.body ? `body: ${data.body}` : null]
    .filter(Boolean)
    .join("\n")
    .trim();

/** Embed an issue in the shared similarity space (see `entity-embedding`). */
export const generateIssueEmbedding = async (
  text: string,
  requestLog?: WorkerLogger
): Promise<number[] | null> => generateSimilarityEmbedding(text, requestLog);
