import type { InferLiveObject } from "@live-state/sync";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { schema } from "../../../live-state/schema";
import { typesenseClient } from "../../search/typesense";
import {
  findSimilarThreadsById,
  generateAndStoreThreadEmbeddings,
  type CombinedThreadDebugInfo,
  type FindSimilarThreadsDebugResult,
  type KeywordChunkDebugInfo,
  type SimilarThreadResult,
  type VectorChunkDebugInfo,
} from "../thread-embeddings";

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const apiRoot = join(__dirname, "../../../../");
dotenv.config({ path: [join(apiRoot, ".env.local"), join(apiRoot, ".env")] });

// Verify env is loaded
if (!process.env.TYPESENSE_API_KEY) {
  console.warn("Warning: TYPESENSE_API_KEY not found in environment variables");
  console.warn(`Looking in: ${join(apiRoot, ".env.local")}`);
}

// Fixed organization ID for test data
const TEST_ORGANIZATION_ID = "test_similarity_search_org";

type Thread = InferLiveObject<
  typeof schema.thread,
  { messages: true; labels: { label: true } }
>;

// JSON data types
interface FakeThreadData {
  id: string;
  name: string;
  messages: string[];
  labels: string[];
}

interface TestCase {
  candidateThreadId: string;
  expectedSimilar: string[];
  expectedDissimilar: string[];
  description: string;
}

interface FakeThreadsFile {
  threads: FakeThreadData[];
  similarityGroups: Record<string, string[]>;
  testCases: TestCase[];
}

// Load fake threads from JSON
const loadFakeThreads = (): FakeThreadsFile => {
  const jsonPath = join(__dirname, "fake-threads.json");
  const content = readFileSync(jsonPath, "utf-8");
  return JSON.parse(content) as FakeThreadsFile;
};

// Convert JSON thread data to Thread type
const convertToThread = (data: FakeThreadData): Thread => {
  return {
    id: data.id,
    name: data.name,
    organizationId: TEST_ORGANIZATION_ID,
    authorId: "test_author",
    createdAt: new Date(),
    deletedAt: null,
    discordChannelId: null,
    externalIssueId: null,
    externalPrId: null,
    status: 0,
    priority: 0,
    assignedUserId: null,
    externalId: null,
    externalOrigin: null,
    externalMetadataStr: null,
    messages: data.messages.map((content, index) => ({
      id: `msg_${data.id}_${index}`,
      threadId: data.id,
      authorId: "test_author",
      content: JSON.stringify([
        {
          type: "paragraph",
          content: [{ type: "text", text: content }],
        },
      ]),
      createdAt: new Date(),
      origin: null,
      externalMessageId: null,
    })),
    labels: data.labels.map((labelName) => ({
      id: `label_${data.id}_${labelName}`,
      threadId: data.id,
      labelId: `label_${labelName}`,
      enabled: true,
      label: {
        id: `label_${labelName}`,
        name: labelName,
        color: "#000000",
        createdAt: new Date(),
        updatedAt: new Date(),
        organizationId: TEST_ORGANIZATION_ID,
        enabled: true,
      },
    })),
  };
};

// Cleanup function to remove test data
const cleanupTestData = async (): Promise<void> => {
  if (!typesenseClient) {
    console.log("Typesense client not available, skipping cleanup");
    return;
  }

  const client = typesenseClient;

  try {
    const searchResults = await client
      .collections("threadChunks")
      .documents()
      .search({
        q: "*",
        filter_by: `organizationId:=${TEST_ORGANIZATION_ID}`,
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
      console.log(`✅ Cleaned up ${searchResults.hits.length} test chunks`);
    } else {
      console.log("No test data found to clean up");
    }
  } catch (error) {
    console.error("Error during cleanup:", error);
    throw error;
  }
};

// Index fake threads into Typesense
const indexFakeThreads = async (): Promise<Map<string, Thread>> => {
  if (!typesenseClient) {
    throw new Error(
      "Typesense client not available. Please set TYPESENSE_API_KEY."
    );
  }

  // Load fake threads from JSON
  console.log("Loading fake threads from JSON...");
  const fakeData = loadFakeThreads();
  console.log(`Loaded ${fakeData.threads.length} threads`);

  // Convert to Thread objects and index them
  console.log("\nIndexing threads...");
  const threads = new Map<string, Thread>();

  for (const threadData of fakeData.threads) {
    const thread = convertToThread(threadData);
    threads.set(thread.id, thread);

    try {
      await generateAndStoreThreadEmbeddings(thread);
      console.log(`  ✅ Indexed: ${thread.name}`);
    } catch (error) {
      console.error(`  ❌ Failed to index ${thread.id}:`, error);
      throw error;
    }
  }

  // Wait for Typesense to index
  console.log("\n⏳ Waiting for indexing to complete...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log(`\n✅ Successfully indexed ${threads.size} threads`);
  return threads;
};

// Metrics calculation
interface EvalMetrics {
  precision: number;
  recall: number;
  foundSimilar: string[];
  missedSimilar: string[];
  wronglyIncludedDissimilar: string[];
}

const calculateMetrics = (
  results: SimilarThreadResult[] | null,
  expectedSimilar: string[],
  expectedDissimilar: string[]
): EvalMetrics => {
  if (!results || results.length === 0) {
    return {
      precision: 0,
      recall: 0,
      foundSimilar: [],
      missedSimilar: expectedSimilar,
      wronglyIncludedDissimilar: [],
    };
  }

  const resultThreadIds = new Set(results.map((r) => r.threadId));

  // Calculate which expected similar threads were found
  const foundSimilar = expectedSimilar.filter((id) => resultThreadIds.has(id));
  const missedSimilar = expectedSimilar.filter(
    (id) => !resultThreadIds.has(id)
  );

  // Check if any dissimilar threads were wrongly included
  const wronglyIncludedDissimilar = expectedDissimilar.filter((id) =>
    resultThreadIds.has(id)
  );

  // Precision: Of the results returned, how many are in the expected similar set?
  // (We only count against expectedSimilar, not penalize for other threads)
  const relevantInResults = results.filter((r) =>
    expectedSimilar.includes(r.threadId)
  ).length;
  const precision =
    results.length > 0
      ? relevantInResults / Math.min(results.length, expectedSimilar.length)
      : 0;

  // Recall: Of the expected similar threads, how many did we find?
  const recall =
    expectedSimilar.length > 0
      ? foundSimilar.length / expectedSimilar.length
      : 1;

  return {
    precision,
    recall,
    foundSimilar,
    missedSimilar,
    wronglyIncludedDissimilar,
  };
};

// Evaluate a single test case using the real findSimilarThreadsById implementation
const evaluateTestCaseDetailed = async (
  testCase: TestCase,
  _threads: Map<string, Thread>
): Promise<{
  testCase: TestCase;
  metrics: EvalMetrics;
  results: SimilarThreadResult[] | null;
  passed: boolean;
  combinedResults: CombinedThreadDebugInfo[];
  vectorChunks: VectorChunkDebugInfo[];
  keywordChunks: KeywordChunkDebugInfo[];
  keywords: string[];
  searchParams?: FindSimilarThreadsDebugResult["debug"]["searchParams"];
}> => {
  if (!typesenseClient) {
    throw new Error("Typesense client not available");
  }

  // Use the real implementation with debug info
  const debugResult = await findSimilarThreadsById(
    testCase.candidateThreadId,
    TEST_ORGANIZATION_ID,
    {
      limit: 10,
      vectorWeight: 0.6,
      keywordWeight: 0.4,
      keywordSteepness: 10,
      cutoffScore: 0.3,
      includeDebug: true,
    }
  );

  if (!debugResult) {
    console.error(
      `No indexed chunks found for thread ${testCase.candidateThreadId}`
    );
    return {
      testCase,
      metrics: {
        precision: 0,
        recall: 0,
        foundSimilar: [],
        missedSimilar: testCase.expectedSimilar,
        wronglyIncludedDissimilar: [],
      },
      results: null,
      passed: false,
      combinedResults: [],
      vectorChunks: [],
      keywordChunks: [],
      keywords: [],
    };
  }

  const { results, debug } = debugResult;

  const metrics = calculateMetrics(
    results,
    testCase.expectedSimilar,
    testCase.expectedDissimilar
  );

  const passed =
    metrics.recall >= 0.5 && metrics.wronglyIncludedDissimilar.length === 0;

  return {
    testCase,
    metrics,
    results,
    passed,
    combinedResults: debug.combinedResults,
    vectorChunks: debug.vectorSearch.chunks,
    keywordChunks: debug.keywordSearch.chunks,
    keywords: debug.keywordSearch.keywords,
    searchParams: debug.searchParams,
  };
};

// Run test cases (assumes threads are already indexed)
const runTestCases = async (threads: Map<string, Thread>): Promise<number> => {
  const fakeData = loadFakeThreads();
  console.log(`Found ${fakeData.testCases.length} test cases`);

  // Run test cases
  console.log("\n" + "=".repeat(70));
  console.log("Running Test Cases (using real findSimilarThreadsById)");
  console.log("=".repeat(70));

  const results: Array<{
    testCase: TestCase;
    metrics: EvalMetrics;
    results: SimilarThreadResult[] | null;
    passed: boolean;
  }> = [];

  for (const testCase of fakeData.testCases) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`Test: ${testCase.description}`);
    console.log(`  Candidate: ${testCase.candidateThreadId}`);
    console.log(`  Expected similar: ${testCase.expectedSimilar.join(", ")}`);
    if (testCase.expectedDissimilar.length > 0) {
      console.log(
        `  Expected dissimilar: ${testCase.expectedDissimilar.join(", ")}`
      );
    }

    const result = await evaluateTestCaseDetailed(testCase, threads);
    results.push({
      testCase: result.testCase,
      metrics: result.metrics,
      results: result.results,
      passed: result.passed,
    });

    // Show search params from the real implementation
    if (result.searchParams) {
      console.log(`\n  ⚙️  Search Parameters (from real implementation):`);
      console.log(
        `    Vector Weight: ${result.searchParams.vectorWeight} (${(
          result.searchParams.vectorWeight * 100
        ).toFixed(0)}%)`
      );
      console.log(
        `    Keyword Weight: ${result.searchParams.keywordWeight} (${(
          result.searchParams.keywordWeight * 100
        ).toFixed(0)}%)`
      );
      console.log(
        `    Keyword S-curve Steepness: ${result.searchParams.keywordSteepness}`
      );
      console.log(`    Cutoff Score: ${result.searchParams.cutoffScore}`);
      console.log(
        `    Limit: ${result.searchParams.limit}, k: ${result.searchParams.k}`
      );
    }

    // Show keywords used
    if (result.keywords.length > 0) {
      console.log(`\n  🔑 Keywords (${result.keywords.length}):`);
      console.log(
        `    ${result.keywords.slice(0, 15).join(", ")}${
          result.keywords.length > 15 ? "..." : ""
        }`
      );
    }

    // Show scoring breakdown
    console.log(`\n  📊 Scoring Breakdown:`);
    console.log(`  Vector search chunks found: ${result.vectorChunks.length}`);
    console.log(
      `  Keyword search chunks found: ${result.keywordChunks.length}`
    );

    // Show vector search statistics
    if (result.vectorChunks.length > 0) {
      console.log(`\n  🔍 Vector Search Results:`);
      const avgVectorScore =
        result.vectorChunks.reduce((sum, c) => sum + c.vectorScore, 0) /
        result.vectorChunks.length;
      console.log(`    Avg vector score: ${avgVectorScore.toFixed(3)}`);

      // Show top 5 vector results
      const topVectorChunks = [...result.vectorChunks]
        .sort((a, b) => b.vectorScore - a.vectorScore)
        .slice(0, 5);
      console.log(`    Top 5 vector matches:`);
      for (const chunk of topVectorChunks) {
        console.log(
          `      - ${chunk.threadId}${
            chunk.chunkIndex !== undefined ? ` (chunk ${chunk.chunkIndex})` : ""
          }: ${chunk.vectorScore.toFixed(4)}`
        );
      }
    }

    // Show keyword search statistics
    if (result.keywordChunks.length > 0) {
      console.log(`\n  🏷️  Keyword Search Results:`);
      const avgKeywordScore =
        result.keywordChunks.reduce((sum, c) => sum + c.keywordScore, 0) /
        result.keywordChunks.length;
      const avgMatchRatio =
        result.keywordChunks.reduce((sum, c) => sum + c.matchRatio, 0) /
        result.keywordChunks.length;
      console.log(
        `    Avg keyword score (S-curve): ${avgKeywordScore.toFixed(3)}`
      );
      console.log(`    Avg match ratio: ${(avgMatchRatio * 100).toFixed(1)}%`);

      // Show top 5 keyword results
      const topKeywordChunks = [...result.keywordChunks]
        .sort((a, b) => b.keywordScore - a.keywordScore)
        .slice(0, 5);
      console.log(`    Top 5 keyword matches:`);
      for (const chunk of topKeywordChunks) {
        console.log(
          `      - ${chunk.threadId}${
            chunk.chunkIndex !== undefined ? ` (chunk ${chunk.chunkIndex})` : ""
          }: score=${chunk.keywordScore.toFixed(4)}, ratio=${(
            chunk.matchRatio * 100
          ).toFixed(0)}% (${chunk.matchedKeywords.length}/${
            chunk.totalKeywords
          })`
        );
      }
    }

    // Show combined results with scoring explanation
    if (result.combinedResults && result.combinedResults.length > 0) {
      console.log(`\n  ✅ Final Combined Thread Scores:`);
      for (const combined of result.combinedResults.slice(0, 10)) {
        const isSimilar = testCase.expectedSimilar.includes(combined.threadId);
        const isDissimilar = testCase.expectedDissimilar.includes(
          combined.threadId
        );
        let marker = "";
        if (isSimilar) marker = " [EXPECTED ✓]";
        else if (isDissimilar) marker = " [WRONG ✗]";

        console.log(`\n    ${combined.threadId}${marker}`);
        console.log(`      Final Score: ${combined.finalScore.toFixed(4)}`);
        console.log(
          `      Vector Score: ${combined.vectorScore.toFixed(
            4
          )} (weight: ${combined.vectorWeight.toFixed(2)})`
        );
        console.log(
          `      Keyword Score: ${combined.keywordScore.toFixed(
            4
          )} (weight: ${combined.keywordWeight.toFixed(2)})`
        );
        console.log(`      Formula: ${combined.formulaDetails}`);
      }
    } else {
      console.log("  No results returned");
    }

    // Show summary results
    if (result.results && result.results.length > 0) {
      console.log(
        `\n  📋 Summary (Top ${Math.min(5, result.results.length)}):`
      );
      for (const r of result.results.slice(0, 5)) {
        const isSimilar = testCase.expectedSimilar.includes(r.threadId);
        const isDissimilar = testCase.expectedDissimilar.includes(r.threadId);
        const marker = isSimilar ? "[EXPECTED]" : isDissimilar ? "[WRONG]" : "";
        console.log(
          `    - ${r.threadId} (score: ${r.score.toFixed(4)}, chunks: ${
            r.chunkCount
          }) ${marker}`
        );
      }
    }

    console.log(`\n  📈 Metrics:`);
    console.log(
      `    Precision: ${(result.metrics.precision * 100).toFixed(1)}%`
    );
    console.log(`    Recall: ${(result.metrics.recall * 100).toFixed(1)}%`);

    if (result.metrics.missedSimilar.length > 0) {
      console.log(`    Missed: ${result.metrics.missedSimilar.join(", ")}`);
    }

    if (result.metrics.wronglyIncludedDissimilar.length > 0) {
      console.log(
        `    Wrongly included: ${result.metrics.wronglyIncludedDissimilar.join(
          ", "
        )}`
      );
    }

    console.log(`\n  Status: ${result.passed ? "✅ PASSED" : "❌ FAILED"}`);
  }

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("Evaluation Summary");
  console.log("=".repeat(70));

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const avgPrecision =
    results.reduce((sum, r) => sum + r.metrics.precision, 0) / total;
  const avgRecall =
    results.reduce((sum, r) => sum + r.metrics.recall, 0) / total;

  console.log(`\nTests passed: ${passed}/${total}`);
  console.log(`Average precision: ${(avgPrecision * 100).toFixed(1)}%`);
  console.log(`Average recall: ${(avgRecall * 100).toFixed(1)}%`);

  console.log("\nIndividual results:");
  for (const result of results) {
    const status = result.passed ? "PASS" : "FAIL";
    console.log(`  [${status}] ${result.testCase.description}`);
  }

  console.log("\n" + "=".repeat(70));
  console.log(
    `Final result: ${
      passed === total ? "ALL TESTS PASSED" : "SOME TESTS FAILED"
    }`
  );
  console.log("=".repeat(70));

  return passed === total ? 0 : 1;
};

// Load threads from Typesense (for running tests without re-indexing)
const loadIndexedThreads = async (): Promise<Map<string, Thread>> => {
  const fakeData = loadFakeThreads();
  const threads = new Map<string, Thread>();

  // Convert JSON data to Thread objects (they should already be indexed)
  for (const threadData of fakeData.threads) {
    const thread = convertToThread(threadData);
    threads.set(thread.id, thread);
  }

  return threads;
};

// Print usage information
const printUsage = (): void => {
  console.log(`
Thread Similarity Search Evaluation Script

Usage:
  bun run hybrid-search.eval.ts [command]

Commands:
  --prepare, --index    Index fake threads into Typesense
  --cleanup, --clean    Remove all test data from Typesense
  --help, -h            Show this help message
  (no args)             Run test cases (assumes threads are already indexed)

Examples:
  # First time setup: index the threads
  bun run hybrid-search.eval.ts --prepare

  # Run the tests
  bun run hybrid-search.eval.ts

  # Clean up when done
  bun run hybrid-search.eval.ts --cleanup

Note: The test organization ID is: ${TEST_ORGANIZATION_ID}
`);
};

// Parse CLI arguments
const parseArgs = (): { mode: "prepare" | "cleanup" | "test" | "help" } => {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    return { mode: "help" };
  }

  if (args.includes("--prepare") || args.includes("--index")) {
    return { mode: "prepare" };
  }

  if (args.includes("--cleanup") || args.includes("--clean")) {
    return { mode: "cleanup" };
  }

  return { mode: "test" };
};

// Main entry point
const main = async (): Promise<void> => {
  const { mode } = parseArgs();

  if (mode === "help") {
    printUsage();
    process.exit(0);
  }

  if (!typesenseClient) {
    console.error(
      "Typesense client not available. Please set TYPESENSE_API_KEY."
    );
    process.exit(1);
  }

  try {
    if (mode === "prepare") {
      console.log("=".repeat(70));
      console.log("Preparing Test Data (Indexing Threads)");
      console.log("=".repeat(70));
      console.log(`Using test organization ID: ${TEST_ORGANIZATION_ID}\n`);

      // Clean up any existing test data first
      console.log("Cleaning up any existing test data...");
      await cleanupTestData();

      // Index threads
      await indexFakeThreads();

      console.log("\n✅ Preparation complete!");
      process.exit(0);
    } else if (mode === "cleanup") {
      console.log("=".repeat(70));
      console.log("Cleaning Up Test Data");
      console.log("=".repeat(70));
      console.log(`Using test organization ID: ${TEST_ORGANIZATION_ID}\n`);

      await cleanupTestData();

      console.log("\n✅ Cleanup complete!");
      process.exit(0);
    } else {
      // Run tests
      console.log("=".repeat(70));
      console.log("Thread Similarity Search Evaluations");
      console.log("=".repeat(70));
      console.log(`Using test organization ID: ${TEST_ORGANIZATION_ID}\n`);

      // Load threads (assumes they're already indexed)
      const threads = await loadIndexedThreads();
      console.log(`Loaded ${threads.size} thread definitions\n`);

      // Run test cases
      const exitCode = await runTestCases(threads);
      process.exit(exitCode);
    }
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
};

// Run the script
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
