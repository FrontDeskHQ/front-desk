import { google } from "@ai-sdk/google";
import type { InferLiveObject } from "@live-state/sync";
import { jsonContentToPlainText, safeParseJSON } from "@workspace/utils/tiptap";
import { generateText, Output } from "ai";
import z from "zod";
import type { schema } from "../../live-state/schema";
import { typesenseClient } from "../search/typesense";
import { generateEmbedding } from "./embeddings";

type Thread = InferLiveObject<
  typeof schema.thread,
  { messages: true; labels: { label: true } }
>;

const MAX_MESSAGES = 3;
const MAX_CHARACTERS = 8000;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const THREAD_COLLECTION = "threads";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

interface ThreadBodySelection {
  bodyText: string;
  messageIds: string[];
  messageCount: number;
  bodyCharacterCount: number;
}

export interface ThreadEmbeddingDebugInfo {
  threadId: string;
  title?: string;
  labels: string[];
  messageIds: string[];
  messageCount: number;
  bodyCharacterCount: number;
  bodyText: string;
  summaryPrompt: string;
  normalizedSummary: string;
  embeddingDimensions: number;
  collection: string;
  documentId: string;
}

export interface ThreadEmbeddingResult {
  success: boolean;
  error?: string;
  debug: ThreadEmbeddingDebugInfo;
}

const getEnabledLabelNames = (thread: Thread): string[] =>
  thread.labels
    ?.filter((tl) => tl.enabled && tl.label?.enabled)
    .map((tl) => tl.label?.name)
    .filter((name): name is string => !!name) ?? [];

const buildThreadBodySelection = (thread: Thread): ThreadBodySelection => {
  const messages = thread.messages ?? [];
  const sortedMessages = [...messages].sort((a, b) => a.id.localeCompare(b.id));

  const bodyParts: string[] = [];
  const messageIds: string[] = [];
  let totalChars = 0;

  for (const message of sortedMessages) {
    if (bodyParts.length >= MAX_MESSAGES) {
      break;
    }

    if (totalChars >= MAX_CHARACTERS) {
      break;
    }

    const messageText = jsonContentToPlainText(
      safeParseJSON(message.content)
    ).trim();

    if (!messageText) {
      continue;
    }

    bodyParts.push(messageText);
    messageIds.push(message.id);
    totalChars += messageText.length + (bodyParts.length > 1 ? 2 : 0);
  }

  return {
    bodyText: bodyParts.join("\n\n"),
    messageIds,
    messageCount: bodyParts.length,
    bodyCharacterCount: totalChars,
  };
};

const buildNormalizationPrompt = (params: {
  title?: string;
  labels: string[];
  body: string;
}): string => {
  const { title, labels, body } = params;

  return `You are normalizing a support thread into a concise, standardized summary.

Rules:
- Keep it concise and factual.
- Focus on details directly related to the issue; OMIT STEPS OR ATTEMPTS THAT ARE NOT THE CENTRAL PROBLEM (e.g., do not include cache-clearing attempts unless cache is central to the issue).
- Use lowercase for topics/signals unless a proper noun.
- Use comma-separated values with no extra commentary.
- If a field has no value, use "none".

Input Title:
${title ?? "none"}

Input Labels:
${labels.length > 0 ? labels.join(", ") : "none"}

Input Body:
${body}`.trim();
};

type NormalizedSummaryOutput = {
  title: string;
  labels: string;
  summary: string;
  topics: string;
  entities: string;
  signals: string;
  action: string;
};

const normalizeSummaryField = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.toLowerCase() === "none") {
    return null;
  }
  return trimmed;
};

const buildNormalizedSummary = (output: NormalizedSummaryOutput): string => {
  const lines = [
    { key: "title", value: normalizeSummaryField(output.title) },
    { key: "labels", value: normalizeSummaryField(output.labels) },
    { key: "summary", value: normalizeSummaryField(output.summary) },
    { key: "topics", value: normalizeSummaryField(output.topics) },
    { key: "entities", value: normalizeSummaryField(output.entities) },
    { key: "signals", value: normalizeSummaryField(output.signals) },
    { key: "action", value: normalizeSummaryField(output.action) },
  ];

  return lines
    .filter((entry) => !!entry.value)
    .map((entry) => `${entry.key}: ${entry.value}`)
    .join("\n");
};

export const generateNormalizedThreadSummary = async (params: {
  title?: string;
  labels: string[];
  body: string;
}): Promise<{ normalizedSummary: string; prompt: string }> => {
  const prompt = buildNormalizationPrompt(params);
  const summarySchema = z.object({
    title: z.string().describe("Thread title or 'none'."),
    labels: z.string().describe("Comma-separated labels or 'none'."),
    summary: z.string().describe("2-6 sentence summary or 'none'."),
    topics: z.string().describe("Comma-separated keywords or 'none'."),
    entities: z
      .string()
      .describe("Comma-separated proper nouns/products or 'none'."),
    signals: z.string().describe("Comma-separated issues/requests or 'none'."),
    action: z.string().describe("Requested outcome or 'none'."),
  });

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { output } = await generateText({
        model: google("gemini-3-flash-preview"),
        output: Output.object({ schema: summarySchema }),
        prompt,
      });

      const normalizedSummary = buildNormalizedSummary(output);

      return {
        normalizedSummary,
        prompt,
      };
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === MAX_RETRIES - 1;

      if (!isLastAttempt) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `Thread summary attempt ${
            attempt + 1
          } failed, retrying in ${delay}ms...`
        );
        await sleep(delay);
      }
    }
  }

  console.error(
    "Error generating thread summary after all retries:",
    lastError
  );
  return { normalizedSummary: "", prompt };
};

export const shouldIncludeMessageInEmbedding = (
  thread: Thread,
  newMessageId: string
): boolean => {
  const { messageIds } = buildThreadBodySelection(thread);
  return messageIds.includes(newMessageId);
};

export const generateAndStoreThreadEmbeddings = async (
  thread: Thread
): Promise<ThreadEmbeddingResult> => {
  const labels = getEnabledLabelNames(thread);
  const { bodyText, messageIds, messageCount, bodyCharacterCount } =
    buildThreadBodySelection(thread);

  const debugBase: ThreadEmbeddingDebugInfo = {
    threadId: thread.id,
    title: thread.name ?? undefined,
    labels,
    messageIds,
    messageCount,
    bodyCharacterCount,
    bodyText,
    summaryPrompt: "",
    normalizedSummary: "",
    embeddingDimensions: 0,
    collection: THREAD_COLLECTION,
    documentId: thread.id,
  };

  if (!typesenseClient) {
    return {
      success: false,
      error: "Typesense client not available",
      debug: debugBase,
    };
  }

  if (!bodyText.trim() && !thread.name && labels.length === 0) {
    console.warn(`Thread ${thread.id} has no content to embed`);
    return {
      success: false,
      error: "Thread has no content to embed",
      debug: debugBase,
    };
  }

  try {
    const { normalizedSummary, prompt } = await generateNormalizedThreadSummary(
      {
        title: thread.name ?? undefined,
        labels,
        body: bodyText,
      }
    );

    if (!normalizedSummary.trim()) {
      return {
        success: false,
        error: "Thread summary was empty",
        debug: {
          ...debugBase,
          summaryPrompt: prompt,
          normalizedSummary,
        },
      };
    }

    const embedding = await generateEmbedding(normalizedSummary);

    if (!embedding) {
      return {
        success: false,
        error: "Failed to generate embedding",
        debug: {
          ...debugBase,
          summaryPrompt: prompt,
          normalizedSummary,
        },
      };
    }

    const client = typesenseClient;

    try {
      await client.collections(THREAD_COLLECTION).documents(thread.id).delete();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("Not Found")) {
        console.warn(
          `Error deleting existing thread doc ${thread.id}:`,
          errorMessage
        );
      }
    }

    await client
      .collections(THREAD_COLLECTION)
      .documents()
      .create({
        id: thread.id,
        threadId: thread.id,
        organizationId: thread.organizationId,
        title: thread.name ?? "",
        labels: labels.join(", "),
        content: normalizedSummary,
        embedding,
      });

    return {
      success: true,
      debug: {
        ...debugBase,
        summaryPrompt: prompt,
        normalizedSummary,
        embeddingDimensions: embedding.length,
      },
    };
  } catch (error) {
    console.error(
      `Error generating thread embeddings for thread ${thread.id}:`,
      error
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      debug: debugBase,
    };
  }
};

export interface SimilarThreadResult {
  threadId: string;
  score: number;
}

export interface ThreadSearchHitDebugInfo {
  threadId: string;
  score: number;
  vectorDistance?: number;
  content?: string;
}

export interface FindSimilarThreadsDebugResult {
  results: SimilarThreadResult[];
  debug: {
    sourceThreadId: string;
    collection: string;
    vectorQuery: string;
    filterBy: string;
    k: number;
    limit: number;
    minScore: number;
    totalHits: number;
    hits: ThreadSearchHitDebugInfo[];
  };
}

export interface FindSimilarThreadsOptions {
  limit?: number;
  minScore?: number;
  excludeThreadIds?: string[];
  k?: number;
  includeDebug?: boolean;
}

/**
 * Finds threads similar to a given thread ID using vector search.
 *
 * @param options.includeDebug - When true, returns FindSimilarThreadsDebugResult with detailed debug info
 */
export function findSimilarThreadsById(
  threadId: string,
  organizationId: string,
  options: FindSimilarThreadsOptions & { includeDebug: true }
): Promise<FindSimilarThreadsDebugResult | null>;
export function findSimilarThreadsById(
  threadId: string,
  organizationId: string,
  options?: FindSimilarThreadsOptions & { includeDebug?: false }
): Promise<SimilarThreadResult[] | null>;
export async function findSimilarThreadsById(
  threadId: string,
  organizationId: string,
  options: FindSimilarThreadsOptions = {}
): Promise<SimilarThreadResult[] | FindSimilarThreadsDebugResult | null> {
  if (!typesenseClient) {
    return null;
  }

  const {
    limit = 10,
    minScore = 0,
    excludeThreadIds = [],
    k = limit * 4,
    includeDebug = false,
  } = options;

  const createEmptyDebugResult = (): FindSimilarThreadsDebugResult => ({
    results: [],
    debug: {
      sourceThreadId: threadId,
      collection: THREAD_COLLECTION,
      vectorQuery: "",
      filterBy: "",
      k,
      limit,
      minScore,
      totalHits: 0,
      hits: [],
    },
  });

  try {
    const sourceDoc = await typesenseClient
      .collections(THREAD_COLLECTION)
      .documents(threadId)
      .retrieve()
      .catch(() => null);

    if (!sourceDoc) {
      console.warn(`No indexed thread found for ${threadId}`);
      return includeDebug ? createEmptyDebugResult() : null;
    }

    const allExcludeIds = [threadId, ...excludeThreadIds];
    const excludeFilter = allExcludeIds
      .map((id) => `threadId:!=${id}`)
      .join(" && ");
    const filterBy = `organizationId:=${organizationId}${
      excludeFilter ? ` && ${excludeFilter}` : ""
    }`;

    const vectorQuery = `embedding:([], id: ${threadId}, k: ${k})`;

    const vectorResults = await typesenseClient.multiSearch.perform(
      {
        searches: [
          {
            collection: THREAD_COLLECTION,
            q: "*",
            vector_query: vectorQuery,
            filter_by: filterBy,
            per_page: k,
          },
        ],
      },
      {}
    );

    const vectorSearchResult = vectorResults.results[0] as
      | {
          hits?: Array<{
            document: {
              id?: string;
              threadId?: string;
              content?: string;
            };
            vector_distance?: number;
            score?: number;
          }>;
        }
      | { error: string }
      | undefined;

    const hits: ThreadSearchHitDebugInfo[] = [];
    const results: SimilarThreadResult[] = [];

    if (
      vectorSearchResult &&
      !("error" in vectorSearchResult) &&
      vectorSearchResult.hits
    ) {
      for (const hit of vectorSearchResult.hits) {
        const hitThreadId = hit.document.threadId ?? hit.document.id ?? "";
        const vectorDistance = hit.vector_distance;
        const score =
          vectorDistance !== undefined ? 1 - vectorDistance : hit.score ?? 0;

        if (!hitThreadId) {
          continue;
        }

        hits.push({
          threadId: hitThreadId,
          score,
          vectorDistance,
          content: hit.document.content,
        });

        results.push({ threadId: hitThreadId, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    const filteredResults = results
      .filter((result) => result.score >= minScore)
      .slice(0, limit);

    if (includeDebug) {
      return {
        results: filteredResults,
        debug: {
          sourceThreadId: threadId,
          collection: THREAD_COLLECTION,
          vectorQuery,
          filterBy,
          k,
          limit,
          minScore,
          totalHits: hits.length,
          hits,
        },
      };
    }

    return filteredResults;
  } catch (error) {
    console.error(
      `Error finding similar threads for thread ${threadId}:`,
      error
    );
    return null;
  }
}
