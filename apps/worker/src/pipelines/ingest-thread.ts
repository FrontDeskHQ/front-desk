import { fetchThreadsWithRelations } from "../lib/database/client";
import { summarizeThread } from "../tools/pre-processors/summary";
import { embedAndStoreThread } from "../tools/processors/embed";
import { findAndStoreSimilarThreads } from "../tools/post-processors/similar-threads";
import type {
  Thread,
  PreProcessorResult,
  ProcessorResult,
  PostProcessorResult,
  PipelineBatchResult,
  ParsedSummary,
} from "./types";

const BATCH_CONCURRENCY = 5;

interface ProcessingOptions {
  concurrency?: number;
  similarThreadsLimit?: number;
  scoreThreshold?: number;
}

/**
 * Run a single thread through the pre-processor stage (summarization)
 */
const runPreProcessor = async (thread: Thread): Promise<PreProcessorResult> => {
  try {
    const summary = await summarizeThread(thread);

    if (!summary || !summary.title || summary.title.trim().length === 0) {
      return {
        threadId: thread.id,
        success: false,
        error: "Failed to generate summary: empty result",
      };
    }

    return {
      threadId: thread.id,
      success: true,
      data: { summary },
    };
  } catch (error) {
    console.error(`Pre-processor failed for thread ${thread.id}:`, error);
    return {
      threadId: thread.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Run a single thread through the processor stage (embedding + Qdrant storage)
 */
const runProcessor = async (
  threadId: string,
  thread: Thread,
  summary: ParsedSummary,
): Promise<ProcessorResult> => {
  return embedAndStoreThread({ threadId, thread, summary });
};

/**
 * Run a single thread through the post-processor stage (similar threads + suggestion storage)
 */
const runPostProcessor = async (
  threadId: string,
  organizationId: string,
  embedding: number[],
  options?: { limit?: number; scoreThreshold?: number },
): Promise<PostProcessorResult> => {
  return findAndStoreSimilarThreads(
    { threadId, organizationId, embedding },
    options,
  );
};

/**
 * Process a batch of threads in parallel with controlled concurrency
 */
const processBatchWithConcurrency = async <T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> => {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }

  return results;
};

/**
 * Main pipeline function: process batch of thread IDs through all stages
 * 
 * Pipeline flow:
 * 1. Fetch thread data from database
 * 2. Pre-processors: Summarize threads (parallel)
 * 3. Processors: Generate embeddings + Store in Qdrant (parallel)
 * 4. Post-processors: Find similar threads + Store in suggestions table (parallel)
 */
export const processIngestThreadBatch = async (
  threadIds: string[],
  options?: ProcessingOptions,
): Promise<PipelineBatchResult> => {
  const concurrency = options?.concurrency ?? BATCH_CONCURRENCY;
  const startTime = performance.now();

  console.log("=".repeat(72));
  console.log(`Thread Ingestion Pipeline - Processing ${threadIds.length} threads`);
  console.log("=".repeat(72));

  // Initialize result containers
  const preProcessorResults: PreProcessorResult[] = [];
  const processorResults: ProcessorResult[] = [];
  const postProcessorResults: PostProcessorResult[] = [];

  // Step 1: Fetch threads from database
  console.log("\n[Step 1/4] Fetching thread data...");
  const fetchStartTime = performance.now();
  const threads = await fetchThreadsWithRelations(threadIds);
  const fetchTime = performance.now() - fetchStartTime;
  console.log(`  Fetched ${threads.size}/${threadIds.length} threads in ${(fetchTime / 1000).toFixed(2)}s`);

  // Handle threads that couldn't be fetched
  const missingThreadIds = threadIds.filter((id) => !threads.has(id));
  for (const threadId of missingThreadIds) {
    preProcessorResults.push({
      threadId,
      success: false,
      error: "Thread not found in database",
    });
  }

  const threadsToProcess = Array.from(threads.entries());
  if (threadsToProcess.length === 0) {
    console.log("  No threads to process");
    return createEmptyResult(threadIds.length);
  }

  // Step 2: Pre-processors (Summarization)
  console.log("\n[Step 2/4] Running pre-processors (summarization)...");
  const preStartTime = performance.now();
  
  const preResults = await processBatchWithConcurrency(
    threadsToProcess,
    async ([, thread]) => runPreProcessor(thread),
    concurrency,
  );
  preProcessorResults.push(...preResults);
  
  const preTime = performance.now() - preStartTime;
  const preSuccessCount = preResults.filter((r) => r.success).length;
  console.log(`  Completed: ${preSuccessCount}/${preResults.length} successful in ${(preTime / 1000).toFixed(2)}s`);

  // Collect successful summaries for processor stage
  const summaryMap = new Map<string, ParsedSummary>();
  for (const result of preResults) {
    if (result.success) {
      summaryMap.set(result.threadId, result.data.summary);
    }
  }

  if (summaryMap.size === 0) {
    console.log("  No successful summaries to embed");
    return createResult(
      threadIds.length,
      preProcessorResults,
      processorResults,
      postProcessorResults,
    );
  }

  // Step 3: Processors (Embedding + Qdrant storage)
  console.log("\n[Step 3/4] Running processors (embedding + Qdrant storage)...");
  const procStartTime = performance.now();

  const threadsWithSummaries = threadsToProcess
    .map(([id, thread]) => {
      const summary = summaryMap.get(id);
      return summary ? { threadId: id, thread, summary } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  
  const procResults = await processBatchWithConcurrency(
    threadsWithSummaries,
    async ({ threadId, thread, summary }) => {
      return runProcessor(threadId, thread, summary);
    },
    concurrency,
  );
  processorResults.push(...procResults);

  // Add errors for threads that failed pre-processing
  for (const result of preResults) {
    if (!result.success) {
      processorResults.push({
        threadId: result.threadId,
        success: false,
        error: `Skipped: pre-processor failed - ${result.error}`,
      });
    }
  }

  const procTime = performance.now() - procStartTime;
  const procSuccessCount = procResults.filter((r) => r.success).length;
  console.log(`  Completed: ${procSuccessCount}/${procResults.length} successful in ${(procTime / 1000).toFixed(2)}s`);

  // Collect successful embeddings for post-processor stage
  const embeddingMap = new Map<string, number[]>();
  for (const result of procResults) {
    if (result.success) {
      embeddingMap.set(result.threadId, result.data.embedding);
    }
  }

  if (embeddingMap.size === 0) {
    console.log("  No successful embeddings for post-processing");
    return createResult(
      threadIds.length,
      preProcessorResults,
      processorResults,
      postProcessorResults,
    );
  }

  // Step 4: Post-processors (Similar threads + Suggestion storage)
  console.log("\n[Step 4/4] Running post-processors (similar threads + suggestions)...");
  const postStartTime = performance.now();

  const threadsWithEmbeddings = threadsToProcess
    .map(([id, thread]) => {
      const embedding = embeddingMap.get(id);
      return embedding ? { threadId: id, thread, embedding } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const postResults = await processBatchWithConcurrency(
    threadsWithEmbeddings,
    async ({ threadId, thread, embedding }) => {
      return runPostProcessor(threadId, thread.organizationId, embedding, {
        limit: options?.similarThreadsLimit,
        scoreThreshold: options?.scoreThreshold,
      });
    },
    concurrency,
  );
  postProcessorResults.push(...postResults);

  // Add errors for threads that failed processing
  for (const result of procResults) {
    if (!result.success) {
      postProcessorResults.push({
        threadId: result.threadId,
        success: false,
        error: `Skipped: processor failed - ${result.error}`,
      });
    }
  }

  const postTime = performance.now() - postStartTime;
  const postSuccessCount = postResults.filter((r) => r.success).length;
  console.log(`  Completed: ${postSuccessCount}/${postResults.length} successful in ${(postTime / 1000).toFixed(2)}s`);

  const totalTime = performance.now() - startTime;

  // Create final result
  const result = createResult(
    threadIds.length,
    preProcessorResults,
    processorResults,
    postProcessorResults,
  );

  // Print summary
  console.log("\n" + "=".repeat(72));
  console.log("Pipeline Complete");
  console.log("=".repeat(72));
  console.log(`  Total threads: ${result.summary.total}`);
  console.log(`  Pre-processor: ${result.summary.preProcessorSuccess} success, ${result.summary.preProcessorFailed} failed`);
  console.log(`  Processor: ${result.summary.processorSuccess} success, ${result.summary.processorFailed} failed`);
  console.log(`  Post-processor: ${result.summary.postProcessorSuccess} success, ${result.summary.postProcessorFailed} failed`);
  console.log(`\nTiming:`);
  console.log(`  Fetch: ${(fetchTime / 1000).toFixed(2)}s`);
  console.log(`  Pre-processor: ${(preTime / 1000).toFixed(2)}s`);
  console.log(`  Processor: ${(procTime / 1000).toFixed(2)}s`);
  console.log(`  Post-processor: ${(postTime / 1000).toFixed(2)}s`);
  console.log(`  Total: ${(totalTime / 1000).toFixed(2)}s`);

  return result;
};

const createEmptyResult = (total: number): PipelineBatchResult => ({
  preProcessorResults: [],
  processorResults: [],
  postProcessorResults: [],
  summary: {
    total,
    preProcessorSuccess: 0,
    preProcessorFailed: total,
    processorSuccess: 0,
    processorFailed: total,
    postProcessorSuccess: 0,
    postProcessorFailed: total,
  },
});

const createResult = (
  total: number,
  preProcessorResults: PreProcessorResult[],
  processorResults: ProcessorResult[],
  postProcessorResults: PostProcessorResult[],
): PipelineBatchResult => ({
  preProcessorResults,
  processorResults,
  postProcessorResults,
  summary: {
    total,
    preProcessorSuccess: preProcessorResults.filter((r) => r.success).length,
    preProcessorFailed: preProcessorResults.filter((r) => !r.success).length,
    processorSuccess: processorResults.filter((r) => r.success).length,
    processorFailed: processorResults.filter((r) => !r.success).length,
    postProcessorSuccess: postProcessorResults.filter((r) => r.success).length,
    postProcessorFailed: postProcessorResults.filter((r) => !r.success).length,
  },
});
