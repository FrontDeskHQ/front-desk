import type { InferLiveObject } from "@live-state/sync";
import { jsonContentToPlainText, safeParseJSON } from "@workspace/utils/tiptap";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { schema } from "../../../live-state/schema";
import { typesenseClient } from "../../search/typesense";
import {
  findSimilarThreadsById,
  generateAndStoreThreadEmbeddings,
  generateNormalizedThreadSummary,
  type FindSimilarThreadsDebugResult,
  type SimilarThreadResult,
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

const printPreprocessOutputForFirstThread = async (
  threadId?: string
): Promise<void> => {
  const fakeData = loadFakeThreads();

  let targetThread: FakeThreadData | undefined;
  if (threadId) {
    targetThread = fakeData.threads.find((t) => t.id === threadId);
    if (!targetThread) {
      console.log(
        `Thread with ID "${threadId}" not found in fake-threads.json`
      );
      console.log(
        `Available thread IDs: ${fakeData.threads.map((t) => t.id).join(", ")}`
      );
      return;
    }
  } else {
    targetThread = fakeData.threads[0];
  }

  if (!targetThread) {
    console.log("No threads found in fake-threads.json");
    return;
  }

  const thread = convertToThread(targetThread);
  const labels =
    thread.labels
      ?.filter((tl) => tl.enabled && tl.label?.enabled)
      .map((tl) => tl.label?.name)
      .filter((name): name is string => !!name) ?? [];

  const sortedMessages = [...(thread.messages ?? [])].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
  const messageTexts: string[] = [];

  for (const message of sortedMessages) {
    if (messageTexts.length >= 3) {
      break;
    }

    const text = safeParseJSON(message.content);
    const plainText = jsonContentToPlainText(text).trim();
    if (plainText) {
      messageTexts.push(plainText);
    }
  }

  const body = messageTexts.join("\n\n");
  const { normalizedSummary } = await generateNormalizedThreadSummary({
    title: thread.name ?? undefined,
    labels,
    body,
  });

  console.log("\n" + "=".repeat(70));
  console.log("Preprocess Output (Gemini Normalized Summary)");
  console.log("=".repeat(70));
  console.log(`Thread ID: ${thread.id}`);
  console.log(`Thread Title: ${thread.name ?? "(no title)"}`);
  console.log(`Labels: ${labels.length > 0 ? labels.join(", ") : "(none)"}`);
  console.log(`Messages used: ${messageTexts.length}`);
  console.log(`Body length: ${body.length} characters`);
  console.log("\n" + "-".repeat(70));
  console.log("Normalized Summary:");
  console.log("-".repeat(70));
  console.log(normalizedSummary || "(empty)");
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
      .collections("threads")
      .documents()
      .search({
        q: "*",
        filter_by: `organizationId:=${TEST_ORGANIZATION_ID}`,
        per_page: 250,
      });

    if (searchResults.hits && searchResults.hits.length > 0) {
      await Promise.all(
        searchResults.hits.map((hit) => {
          const threadId = (hit.document as { id: string }).id;
          return client
            .collections("threads")
            .documents(threadId)
            .delete()
            .catch((error) => {
              console.warn(`Error deleting thread ${threadId}:`, error);
            });
        })
      );
      console.log(`✅ Cleaned up ${searchResults.hits.length} test threads`);
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
      const embedResult = await generateAndStoreThreadEmbeddings(thread);
      const debug = embedResult.debug;
      console.log(
        `  ✅ Indexed: ${thread.name} (messages: ${debug.messageCount}, chars: ${debug.bodyCharacterCount})`
      );
      if (!embedResult.success) {
        console.warn(
          `    ⚠️  Embed warning: ${embedResult.error ?? "unknown"}`
        );
      }
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
  searchDebug?: FindSimilarThreadsDebugResult["debug"];
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
      minScore: 0,
      k: 40,
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
      searchDebug: undefined,
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
    searchDebug: debug,
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
    if (result.searchDebug) {
      console.log(`\n  ⚙️  Search Parameters (from real implementation):`);
      console.log(`    Collection: ${result.searchDebug.collection}`);
      console.log(
        `    Limit: ${result.searchDebug.limit}, k: ${result.searchDebug.k}`
      );
      console.log(`    Min Score: ${result.searchDebug.minScore}`);
      console.log(`    Vector Query: ${result.searchDebug.vectorQuery}`);
    }

    // Show scoring breakdown
    console.log(`\n  📊 Scoring Breakdown:`);
    const hitCount = result.searchDebug?.totalHits ?? 0;
    console.log(`  Vector search hits found: ${hitCount}`);

    if (result.searchDebug && result.searchDebug.hits.length > 0) {
      console.log(`\n  🔍 Vector Search Results:`);
      const avgVectorScore =
        result.searchDebug.hits.reduce((sum, c) => sum + c.score, 0) /
        result.searchDebug.hits.length;
      console.log(`    Avg vector score: ${avgVectorScore.toFixed(3)}`);

      const topVectorHits = [...result.searchDebug.hits]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      console.log(`    Top 5 vector matches:`);
      for (const hit of topVectorHits) {
        console.log(`      - ${hit.threadId}: ${hit.score.toFixed(4)}`);
      }
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
          `    - ${r.threadId} (score: ${r.score.toFixed(4)}) ${marker}`
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
  --preprocess [id]    Show Gemini preprocessing output for a thread
                       (if no ID provided, uses first thread)
  --help, -h            Show this help message
  (no args)             Run test cases (assumes threads are already indexed)

Examples:
  # First time setup: index the threads
  bun run hybrid-search.eval.ts --prepare

  # Run the tests
  bun run hybrid-search.eval.ts

  # Clean up when done
  bun run hybrid-search.eval.ts --cleanup

  # Check preprocessing output for the first thread
  bun run hybrid-search.eval.ts --preprocess

  # Check preprocessing output for a specific thread
  bun run hybrid-search.eval.ts --preprocess thread_123

Note: The test organization ID is: ${TEST_ORGANIZATION_ID}
`);
};

// Parse CLI arguments
const parseArgs = (): {
  mode: "prepare" | "cleanup" | "test" | "help" | "preprocess";
  threadId?: string;
} => {
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

  if (args.includes("--preprocess")) {
    const preprocessIndex = args.indexOf("--preprocess");
    const threadId = args[preprocessIndex + 1];
    return { mode: "preprocess", threadId };
  }

  return { mode: "test" };
};

// Main entry point
const main = async (): Promise<void> => {
  const args = parseArgs();
  const { mode, threadId } = args;

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
    } else if (mode === "preprocess") {
      console.log("=".repeat(70));
      console.log("Thread Preprocessing Output");
      console.log("=".repeat(70));
      await printPreprocessOutputForFirstThread(threadId);
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
