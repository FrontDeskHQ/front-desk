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

const MAX_MESSAGES = 5;
const MAX_CHARACTERS = 3000;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const extractThreadKeywords = async (
  threadText: string
): Promise<string> => {
  if (!threadText || threadText.trim().length === 0) {
    return "";
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { output: aiResult } = await generateText({
        model: google("gemini-2.0-flash"),
        output: Output.object({
          schema: z.object({
            keywords: z
              .array(z.string())
              .describe(
                "Array of relevant keywords extracted from the thread content. Focus on important terms, topics, technologies, issues, and concepts. Return 5-15 keywords."
              ),
          }),
        }),
        prompt: `Extract relevant keywords from the following support thread content.

KEYWORD GUIDELINES:
- Use SINGULAR form (e.g., "user" not "users", "error" not "errors")
- Use LOWERCASE only (e.g., "authentication" not "Authentication")
- Prefer NOUNS over verbs or adjectives (e.g., "configuration" not "configure")
- Use ROOT/BASE form of words (e.g., "payment" not "paying")
- Keep proper nouns/brand names in their standard form (e.g., "react", "typescript", "stripe")
- Use simple, single-word keywords when possible
- For compound concepts, use hyphenated form (e.g., "error-handling", "rate-limit")

FOCUS ON:
- Main topics and subjects discussed
- Technologies, tools, or products mentioned
- Issues or problems described (as nouns: "bug", "crash", "timeout")
- Important concepts or domain terms

Return 5-15 standardized keywords that best represent the thread content.

Thread Content:
${threadText}`,
      });

      return aiResult.keywords.join(", ");
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === MAX_RETRIES - 1;

      if (!isLastAttempt) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `Keyword extraction attempt ${
            attempt + 1
          } failed, retrying in ${delay}ms...`
        );
        await sleep(delay);
      }
    }
  }

  console.error("Error extracting keywords after all retries:", lastError);
  return "";
};

export const shouldIncludeMessageInEmbedding = (
  thread: Thread,
  newMessageId: string
): boolean => {
  const messages = thread.messages ?? [];
  const sortedMessages = messages.sort((a, b) => a.id.localeCompare(b.id));

  const newMessageIndex = sortedMessages.findIndex(
    (msg) => msg.id === newMessageId
  );

  if (newMessageIndex === -1) {
    return false;
  }

  const parts: string[] = [];

  if (thread.name) {
    parts.push(`Title: ${thread.name}`);
  }

  const enabledLabels = thread.labels
    ?.filter((tl) => tl.enabled && tl.label?.enabled)
    .map((tl) => tl.label?.name)
    .filter((name): name is string => !!name);

  if (enabledLabels && enabledLabels.length > 0) {
    parts.push(`Labels: ${enabledLabels.join(", ")}`);
  }

  const includedMessages: typeof sortedMessages = [];
  let totalChars = parts.join("\n\n").length;

  for (const message of sortedMessages) {
    const messageText = jsonContentToPlainText(
      safeParseJSON(message.content)
    ).trim();

    if (!messageText) {
      continue;
    }

    const messageWithPrefix = `Message ${
      includedMessages.length + 1
    }: ${messageText}`;
    const messageLength = messageWithPrefix.length;

    if (includedMessages.length >= MAX_MESSAGES) {
      break;
    }

    if (
      includedMessages.length > 0 &&
      totalChars + messageLength > MAX_CHARACTERS
    ) {
      break;
    }

    includedMessages.push(message);
    totalChars += messageLength + 2;

    if (message.id === newMessageId) {
      return true;
    }
  }

  return false;
};

export const buildThreadText = (thread: Thread): string => {
  const parts: string[] = [];

  if (thread.name) {
    parts.push(`Title: ${thread.name}`);
  }

  const enabledLabels = thread.labels
    ?.filter((tl) => tl.enabled && tl.label?.enabled)
    .map((tl) => tl.label?.name)
    .filter((name): name is string => !!name);

  if (enabledLabels && enabledLabels.length > 0) {
    parts.push(`Labels: ${enabledLabels.join(", ")}`);
  }

  const messages = thread.messages ?? [];
  const sortedMessages = messages.sort((a, b) => a.id.localeCompare(b.id));

  const includedMessages: typeof sortedMessages = [];
  let totalChars = parts.join("\n\n").length;

  for (const message of sortedMessages) {
    const messageText = jsonContentToPlainText(
      safeParseJSON(message.content)
    ).trim();

    if (!messageText) {
      continue;
    }

    const messageWithPrefix = `Message ${
      includedMessages.length + 1
    }: ${messageText}`;
    const messageLength = messageWithPrefix.length;

    if (includedMessages.length >= MAX_MESSAGES) {
      break;
    }

    if (
      includedMessages.length > 0 &&
      totalChars + messageLength > MAX_CHARACTERS
    ) {
      break;
    }

    includedMessages.push(message);
    totalChars += messageLength + 2;
  }

  if (includedMessages.length > 0) {
    const messageTexts = includedMessages.map((message, index) => {
      const messageText = jsonContentToPlainText(
        safeParseJSON(message.content)
      ).trim();
      return `Message ${index + 1}: ${messageText}`;
    });
    parts.push(...messageTexts);
  }

  return parts.join("\n\n");
};

export const chunkText = (
  text: string,
  chunkSize: number = 600,
  overlap: number = 150
): string[] => {
  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end);
    chunks.push(chunk);

    start += chunkSize - overlap;

    if (end >= text.length) {
      break;
    }
  }

  return chunks;
};

export const generateAndStoreThreadEmbeddings = async (
  thread: Thread
): Promise<void> => {
  if (!typesenseClient) {
    return;
  }

  const client = typesenseClient;

  try {
    const threadText = buildThreadText(thread);

    if (!threadText.trim()) {
      console.warn(`Thread ${thread.id} has no content to embed`);
      return;
    }

    const chunks = chunkText(threadText);

    // Extract keywords in parallel with embedding generation
    const keywordsPromise = extractThreadKeywords(threadText);

    try {
      const searchResults = await client
        .collections("threadChunks")
        .documents()
        .search({
          q: "*",
          filter_by: `threadId:=${thread.id}`,
          per_page: 250,
        });

      if (searchResults.hits && searchResults.hits.length > 0) {
        await Promise.all(
          searchResults.hits.map((hit) => {
            const chunkId = (hit.document as { id: string }).id;
            return client
              .collections("threadChunks")
              .documents(chunkId)
              .delete()
              .catch((error) => {
                console.warn(`Error deleting chunk ${chunkId}:`, error);
              });
          })
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("Not Found")) {
        console.warn(
          `Error deleting existing chunks for thread ${thread.id}:`,
          errorMessage
        );
      }
    }

    // Generate embeddings for all chunks in parallel
    const embeddingPromises = chunks.map((chunk) => generateEmbedding(chunk));

    // Wait for both keywords and embeddings to complete
    const [keywords, ...embeddings] = await Promise.all([
      keywordsPromise,
      ...embeddingPromises,
    ]);

    // Store chunks with their embeddings and keywords
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];

      if (!embedding) {
        console.warn(
          `Failed to generate embedding for chunk ${i} of thread ${thread.id}`
        );
        continue;
      }

      const chunkId = `${thread.id}_chunk_${i}`;

      await client
        .collections("threadChunks")
        .documents()
        .create({
          id: chunkId,
          threadId: thread.id,
          organizationId: thread.organizationId,
          chunkIndex: i,
          content: chunk,
          keywords: keywords || "",
          embedding: embedding,
        });
    }
  } catch (error) {
    console.error(
      `Error generating thread embeddings for thread ${thread.id}:`,
      error
    );
  }
};

export interface SimilarThreadResult {
  threadId: string;
  score: number;
  chunkCount: number;
}

/** Debug information for a single chunk from vector search */
export interface VectorChunkDebugInfo {
  threadId: string;
  chunkIndex?: number;
  vectorDistance: number;
  vectorScore: number;
  content?: string;
}

/** Debug information for a single chunk from keyword search */
export interface KeywordChunkDebugInfo {
  threadId: string;
  chunkIndex?: number;
  matchedKeywords: string[];
  totalKeywords: number;
  matchRatio: number;
  keywordScore: number; // S-curve score
  content?: string;
}

/** Debug information for aggregated thread from vector search */
export interface VectorThreadDebugInfo {
  threadId: string;
  score: number;
  chunkCount: number;
  chunkScores: number[];
}

/** Debug information for aggregated thread from keyword search */
export interface KeywordThreadDebugInfo {
  threadId: string;
  score: number;
  chunkCount: number;
  bestMatchRatio: number;
  matchedKeywords: string[];
}

/** Debug information for combined thread results */
export interface CombinedThreadDebugInfo {
  threadId: string;
  finalScore: number;
  vectorScore: number;
  keywordScore: number;
  vectorWeight: number;
  keywordWeight: number;
  formulaDetails: string;
}

/** Extended result with debug information */
export interface FindSimilarThreadsDebugResult {
  results: SimilarThreadResult[];
  debug: {
    vectorSearch: {
      totalChunksFound: number;
      chunks: VectorChunkDebugInfo[];
      threadResults: VectorThreadDebugInfo[];
    };
    keywordSearch: {
      keywords: string[];
      totalChunksFound: number;
      chunks: KeywordChunkDebugInfo[];
      threadResults: KeywordThreadDebugInfo[];
    };
    combinedResults: CombinedThreadDebugInfo[];
    searchParams: {
      vectorWeight: number;
      keywordWeight: number;
      keywordSteepness: number;
      cutoffScore: number;
      limit: number;
      k: number;
    };
  };
}

export interface FindSimilarThreadsOptions {
  limit?: number;
  minScore?: number;
  excludeThreadIds?: string[];
  /**
   * Weight for vector search results (0-1).
   * Higher values give more importance to semantic similarity.
   * Default: 0.6
   */
  vectorWeight?: number;
  /**
   * Weight for keyword search results (0-1).
   * Higher values give more importance to keyword matches.
   * Default: 0.4
   */
  keywordWeight?: number;
  /**
   * Steepness parameter for the S-curve keyword scoring.
   * Higher values create a sharper transition between low and high scores.
   * Default: 10
   */
  keywordSteepness?: number;
  /**
   * Cutoff score for filtering low-scoring results before returning.
   * Results with scores below this threshold are removed.
   * Default: 0.3 (removes results with <30% similarity)
   */
  cutoffScore?: number;
  /**
   * When true, returns detailed debug information about all chunks and scoring.
   * Default: false
   */
  includeDebug?: boolean;
}

/**
 * Calculates an S-curve (sigmoid) score based on the match ratio.
 * This boosts high match ratios and penalizes low match ratios.
 *
 * @param matchRatio - The ratio of matched keywords to total keywords (0-1)
 * @param steepness - Controls how sharp the S-curve transition is (default: 10)
 * @param midpoint - The center point of the S-curve (default: 0.5)
 * @returns A score between 0 and 1
 */
export const calculateSCurveScore = (
  matchRatio: number,
  steepness: number = 10,
  midpoint: number = 0.5
): number => {
  // Sigmoid function centered at midpoint: 1 / (1 + e^(-k*(x-midpoint)))
  return 1 / (1 + Math.exp(-steepness * (matchRatio - midpoint)));
};

/**
 * Calculates an adaptive midpoint for the S-curve based on the best match ratio found.
 * This makes the S-curve semi-adaptive: it still penalizes low match ratios,
 * but not as harshly when all match ratios in the result set are low.
 *
 * @param maxMatchRatio - The highest match ratio found across all results
 * @param minMidpoint - The minimum midpoint to use (default: 0.25)
 * @returns An adaptive midpoint between minMidpoint and 0.5
 */
export const calculateAdaptiveMidpoint = (
  maxMatchRatio: number,
  minMidpoint: number = 0.25
): number => {
  // If the best match ratio is high (>= 0.5), use standard midpoint of 0.5
  // If the best match ratio is low, shift midpoint down proportionally
  // but never below minMidpoint to ensure some penalty remains
  return Math.max(minMidpoint, Math.min(0.5, maxMatchRatio * 0.8));
};

/**
 * Aggregates vector search chunk results by threadId.
 * Uses max score from all chunks for each thread.
 */
export const aggregateVectorResultsByThread = (
  hits: Array<{
    document: { threadId: string };
    vector_distance: number;
  }>
): Map<
  string,
  { score: number; chunkCount: number; chunkScores: number[] }
> => {
  const threadScores = new Map<
    string,
    { scores: number[]; chunkCount: number }
  >();

  for (const hit of hits) {
    const threadId = hit.document.threadId;
    const score = 1 - hit.vector_distance;

    const existing = threadScores.get(threadId);
    if (existing) {
      existing.scores.push(score);
      existing.chunkCount += 1;
    } else {
      threadScores.set(threadId, { scores: [score], chunkCount: 1 });
    }
  }

  const result = new Map<
    string,
    { score: number; chunkCount: number; chunkScores: number[] }
  >();

  for (const [threadId, { scores, chunkCount }] of threadScores) {
    result.set(threadId, {
      score: Math.max(...scores),
      chunkCount,
      chunkScores: scores,
    });
  }

  return result;
};

/**
 * Aggregates keyword search results by threadId.
 * For each thread, uses the best (highest) keyword match score.
 */
export const aggregateKeywordResultsByThread = (
  chunkResults: Array<{
    threadId: string;
    matchedKeywords: string[];
    matchRatio: number;
    keywordScore: number;
  }>
): Map<
  string,
  {
    score: number;
    chunkCount: number;
    bestMatchRatio: number;
    matchedKeywords: string[];
  }
> => {
  const threadScores = new Map<
    string,
    {
      bestScore: number;
      bestMatchRatio: number;
      allMatchedKeywords: Set<string>;
      chunkCount: number;
    }
  >();

  for (const chunk of chunkResults) {
    const existing = threadScores.get(chunk.threadId);
    if (existing) {
      if (chunk.keywordScore > existing.bestScore) {
        existing.bestScore = chunk.keywordScore;
        existing.bestMatchRatio = chunk.matchRatio;
      }
      for (const kw of chunk.matchedKeywords) {
        existing.allMatchedKeywords.add(kw);
      }
      existing.chunkCount += 1;
    } else {
      threadScores.set(chunk.threadId, {
        bestScore: chunk.keywordScore,
        bestMatchRatio: chunk.matchRatio,
        allMatchedKeywords: new Set(chunk.matchedKeywords),
        chunkCount: 1,
      });
    }
  }

  const result = new Map<
    string,
    {
      score: number;
      chunkCount: number;
      bestMatchRatio: number;
      matchedKeywords: string[];
    }
  >();

  for (const [
    threadId,
    { bestScore, bestMatchRatio, allMatchedKeywords, chunkCount },
  ] of threadScores) {
    result.set(threadId, {
      score: bestScore,
      chunkCount,
      bestMatchRatio,
      matchedKeywords: Array.from(allMatchedKeywords),
    });
  }

  return result;
};

/**
 * Finds threads similar to a given thread ID using two independent searches:
 * 1. Pure vector search - semantic similarity using embeddings
 * 2. Keyword matching search - counts keyword matches with S-curve scoring
 *
 * Results are combined using configurable weights for each search type.
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
    vectorWeight = 0.6,
    keywordWeight = 0.4,
    keywordSteepness = 10,
    cutoffScore = 0.3,
    includeDebug = false,
  } = options;

  const k = limit * 4; // Retrieve more chunks than needed for better coverage

  // Helper to create empty debug result
  const createEmptyDebugResult = (): FindSimilarThreadsDebugResult => ({
    results: [],
    debug: {
      vectorSearch: {
        totalChunksFound: 0,
        chunks: [],
        threadResults: [],
      },
      keywordSearch: {
        keywords: [],
        totalChunksFound: 0,
        chunks: [],
        threadResults: [],
      },
      combinedResults: [],
      searchParams: {
        vectorWeight,
        keywordWeight,
        keywordSteepness,
        cutoffScore,
        limit,
        k,
      },
    },
  });

  try {
    // First, retrieve the existing chunks for this thread to get its embedding and keywords
    const existingChunks = await typesenseClient
      .collections("threadChunks")
      .documents()
      .search({
        q: "*",
        filter_by: `threadId:=${threadId} && organizationId:=${organizationId}`,
        per_page: 1,
      });

    if (!existingChunks.hits || existingChunks.hits.length === 0) {
      console.warn(`No indexed chunks found for thread ${threadId}`);
      if (includeDebug) {
        return createEmptyDebugResult();
      }
      return null;
    }

    // Get the embedding and keywords from the first chunk
    const firstChunk = existingChunks.hits[0].document as {
      embedding?: number[];
      content: string;
      keywords?: string;
    };

    let threadEmbedding: number[] | undefined = firstChunk.embedding;
    const candidateKeywords = firstChunk.keywords;

    // Parse keywords into array
    const keywords = candidateKeywords
      ? candidateKeywords
          .split(",")
          .map((kw) => kw.trim().toLowerCase())
          .filter((kw) => kw.length > 0)
      : [];

    // If embedding is not stored, regenerate it from the content
    if (!threadEmbedding || threadEmbedding.length === 0) {
      const generatedEmbedding = await generateEmbedding(firstChunk.content);
      if (!generatedEmbedding) {
        console.warn(`Failed to generate embedding for thread ${threadId}`);
        return null;
      }
      threadEmbedding = generatedEmbedding;
    }

    // Always exclude the source thread from results
    const allExcludeIds = [threadId, ...excludeThreadIds];

    // Build filter to exclude specified threads
    const excludeFilter = allExcludeIds
      .map((id) => `threadId:!=${id}`)
      .join(" && ");
    const filterBy = `organizationId:=${organizationId} && ${excludeFilter}`;

    // ============================================================
    // SEARCH 1: Pure Vector Search
    // ============================================================
    const vectorQueryString = `embedding:([${threadEmbedding.join(
      ","
    )}], k: ${k})`;

    const vectorSearchPromise = typesenseClient.multiSearch.perform(
      {
        searches: [
          {
            collection: "threadChunks",
            q: "*",
            vector_query: vectorQueryString,
            filter_by: filterBy,
            per_page: k,
          },
        ],
      },
      {}
    );

    // ============================================================
    // SEARCH 2: Keyword Matching Search
    // ============================================================
    // Search for chunks that contain any of the keywords
    const keywordSearchPromise =
      keywords.length > 0
        ? typesenseClient.multiSearch.perform(
            {
              searches: [
                {
                  collection: "threadChunks",
                  q: keywords.join(" "), // Search all keywords as independent terms
                  query_by: "keywords,content",
                  filter_by: filterBy,
                  per_page: k,
                },
              ],
            },
            {}
          )
        : Promise.resolve(null);

    // Execute both searches in parallel
    const [vectorResults, keywordResults] = await Promise.all([
      vectorSearchPromise,
      keywordSearchPromise,
    ]);

    // ============================================================
    // Process Vector Search Results
    // ============================================================
    const vectorSearchResult = vectorResults.results[0] as
      | {
          hits?: Array<{
            document: {
              threadId: string;
              chunkIndex?: number;
              content?: string;
              keywords?: string;
            };
            vector_distance?: number;
          }>;
        }
      | { error: string }
      | undefined;

    const vectorChunks: VectorChunkDebugInfo[] = [];
    const vectorHitsForAggregation: Array<{
      document: { threadId: string };
      vector_distance: number;
    }> = [];

    if (
      vectorSearchResult &&
      !("error" in vectorSearchResult) &&
      vectorSearchResult.hits
    ) {
      for (const hit of vectorSearchResult.hits) {
        if (hit.vector_distance !== undefined) {
          const vectorScore = 1 - hit.vector_distance;
          vectorChunks.push({
            threadId: hit.document.threadId,
            chunkIndex: hit.document.chunkIndex,
            vectorDistance: hit.vector_distance,
            vectorScore,
            content: hit.document.content,
          });
          vectorHitsForAggregation.push({
            document: { threadId: hit.document.threadId },
            vector_distance: hit.vector_distance,
          });
        }
      }
    }

    const vectorThreadScores = aggregateVectorResultsByThread(
      vectorHitsForAggregation
    );

    // ============================================================
    // Process Keyword Search Results
    // ============================================================
    const keywordChunks: KeywordChunkDebugInfo[] = [];
    const keywordChunksForAggregation: Array<{
      threadId: string;
      matchedKeywords: string[];
      matchRatio: number;
      keywordScore: number;
    }> = [];

    if (keywordResults) {
      const keywordSearchResult = keywordResults.results[0] as
        | {
            hits?: Array<{
              document: {
                threadId: string;
                chunkIndex?: number;
                content?: string;
                keywords?: string;
              };
            }>;
          }
        | { error: string }
        | undefined;

      if (
        keywordSearchResult &&
        !("error" in keywordSearchResult) &&
        keywordSearchResult.hits
      ) {
        // First pass: calculate match ratios for all chunks
        const chunkMatchData: Array<{
          hit: (typeof keywordSearchResult.hits)[0];
          matchedKeywords: string[];
          matchRatio: number;
        }> = [];

        for (const hit of keywordSearchResult.hits) {
          const chunkContent = (
            (hit.document.content || "") +
            " " +
            (hit.document.keywords || "")
          ).toLowerCase();

          const matchedKeywords = keywords.filter((kw) =>
            chunkContent.includes(kw)
          );
          const matchRatio =
            keywords.length > 0 ? matchedKeywords.length / keywords.length : 0;

          chunkMatchData.push({ hit, matchedKeywords, matchRatio });
        }

        // Calculate adaptive midpoint based on max match ratio found
        const maxMatchRatio = Math.max(
          ...chunkMatchData.map((d) => d.matchRatio),
          0
        );
        const adaptiveMidpoint = calculateAdaptiveMidpoint(maxMatchRatio);

        // Second pass: apply S-curve scores with adaptive midpoint
        for (const { hit, matchedKeywords, matchRatio } of chunkMatchData) {
          const keywordScore = calculateSCurveScore(
            matchRatio,
            keywordSteepness,
            adaptiveMidpoint
          );

          keywordChunks.push({
            threadId: hit.document.threadId,
            chunkIndex: hit.document.chunkIndex,
            matchedKeywords,
            totalKeywords: keywords.length,
            matchRatio,
            keywordScore,
            content: hit.document.content,
          });

          keywordChunksForAggregation.push({
            threadId: hit.document.threadId,
            matchedKeywords,
            matchRatio,
            keywordScore,
          });
        }
      }
    }

    const keywordThreadScores = aggregateKeywordResultsByThread(
      keywordChunksForAggregation
    );

    // ============================================================
    // Combine Results from Both Searches
    // ============================================================
    // Get all unique thread IDs from both searches
    const allThreadIds = new Set<string>();
    for (const threadIdKey of vectorThreadScores.keys()) {
      allThreadIds.add(threadIdKey);
    }
    for (const threadIdKey of keywordThreadScores.keys()) {
      allThreadIds.add(threadIdKey);
    }

    const combinedResults: CombinedThreadDebugInfo[] = [];
    const finalResults: SimilarThreadResult[] = [];

    // Normalize weights to sum to 1
    const totalWeight = vectorWeight + keywordWeight;
    const normalizedVectorWeight = vectorWeight / totalWeight;
    const normalizedKeywordWeight = keywordWeight / totalWeight;

    for (const tid of allThreadIds) {
      const vectorData = vectorThreadScores.get(tid);
      const keywordData = keywordThreadScores.get(tid);

      const vScore = vectorData?.score ?? 0;
      const kScore = keywordData?.score ?? 0;

      const finalScore =
        vScore * normalizedVectorWeight + kScore * normalizedKeywordWeight;

      const formulaDetails = `(${vScore.toFixed(
        3
      )} * ${normalizedVectorWeight.toFixed(2)}) + (${kScore.toFixed(
        3
      )} * ${normalizedKeywordWeight.toFixed(2)}) = ${finalScore.toFixed(3)}`;

      combinedResults.push({
        threadId: tid,
        finalScore,
        vectorScore: vScore,
        keywordScore: kScore,
        vectorWeight: normalizedVectorWeight,
        keywordWeight: normalizedKeywordWeight,
        formulaDetails,
      });

      const chunkCount =
        (vectorData?.chunkCount ?? 0) + (keywordData?.chunkCount ?? 0);

      finalResults.push({
        threadId: tid,
        score: finalScore,
        chunkCount,
      });
    }

    // Sort by final score and apply filters
    combinedResults.sort((a, b) => b.finalScore - a.finalScore);
    finalResults.sort((a, b) => b.score - a.score);

    const filteredResults = finalResults
      .filter(
        (result) => result.score >= cutoffScore && result.score >= minScore
      )
      .slice(0, limit);

    if (includeDebug) {
      // Build debug info for vector thread results
      const vectorThreadDebugInfo: VectorThreadDebugInfo[] = Array.from(
        vectorThreadScores.entries()
      )
        .map(([tid, data]) => ({
          threadId: tid,
          score: data.score,
          chunkCount: data.chunkCount,
          chunkScores: data.chunkScores,
        }))
        .sort((a, b) => b.score - a.score);

      // Build debug info for keyword thread results
      const keywordThreadDebugInfo: KeywordThreadDebugInfo[] = Array.from(
        keywordThreadScores.entries()
      )
        .map(([tid, data]) => ({
          threadId: tid,
          score: data.score,
          chunkCount: data.chunkCount,
          bestMatchRatio: data.bestMatchRatio,
          matchedKeywords: data.matchedKeywords,
        }))
        .sort((a, b) => b.score - a.score);

      return {
        results: filteredResults,
        debug: {
          vectorSearch: {
            totalChunksFound: vectorChunks.length,
            chunks: vectorChunks,
            threadResults: vectorThreadDebugInfo,
          },
          keywordSearch: {
            keywords,
            totalChunksFound: keywordChunks.length,
            chunks: keywordChunks,
            threadResults: keywordThreadDebugInfo,
          },
          combinedResults,
          searchParams: {
            vectorWeight,
            keywordWeight,
            keywordSteepness,
            cutoffScore,
            limit,
            k,
          },
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
