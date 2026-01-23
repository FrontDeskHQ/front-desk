import { batchFindSimilarThreads } from "../tools/post-processors/similar-threads";
import {
  buildThreadSimilarityDataset,
  TEST_ORGANIZATION_ID,
  type TestCase,
} from "./thread-similarity.dataset";

const SEARCH_LIMIT = 5;
const SCORE_THRESHOLD = 0.6;

interface EvalMetrics {
  precision: number;
  recall: number;
  foundSimilar: string[];
  missedSimilar: string[];
  unexpectedResults: string[];
  dissimilarHits: string[];
}

const calculateMetrics = (
  returnedIds: string[],
  expectedSimilar: string[],
  expectedDissimilar: string[],
): EvalMetrics => {
  const expectedSimilarSet = new Set(expectedSimilar);
  const expectedDissimilarSet = new Set(expectedDissimilar);

  const foundSimilar = expectedSimilar.filter((id) => returnedIds.includes(id));
  const missedSimilar = expectedSimilar.filter(
    (id) => !returnedIds.includes(id),
  );
  const dissimilarHits = expectedDissimilar.filter((id) =>
    returnedIds.includes(id),
  );

  const unexpectedResults = returnedIds.filter(
    (id) => !expectedSimilarSet.has(id) && !expectedDissimilarSet.has(id),
  );

  const precision =
    returnedIds.length > 0 ? foundSimilar.length / returnedIds.length : 0;
  const recall =
    expectedSimilar.length > 0
      ? foundSimilar.length / expectedSimilar.length
      : 1;

  return {
    precision,
    recall,
    foundSimilar,
    missedSimilar,
    unexpectedResults,
    dissimilarHits,
  };
};

const renderResultLine = (
  threadId: string,
  score: number,
  testCase: TestCase,
): string => {
  const isExpected = testCase.expectedSimilar.includes(threadId);
  const isDissimilar = testCase.expectedDissimilar.includes(threadId);
  const marker = isExpected ? "[EXPECTED]" : isDissimilar ? "[WRONG]" : "";
  return `  - ${threadId} (score: ${score.toFixed(4)}) ${marker}`.trimEnd();
};

const evaluateTestCase = (
  testCase: TestCase,
  batchResults: Map<string, Array<{ threadId: string; score: number }>>,
) => {
  const results = batchResults.get(testCase.candidateThreadId) || [];

  if (results.length === 0) {
    return {
      testCase,
      metrics: calculateMetrics(
        [],
        testCase.expectedSimilar,
        testCase.expectedDissimilar,
      ),
      results: [],
      error: `No similar threads found for ${testCase.candidateThreadId}`,
    };
  }

  const returnedIds = results.map((result) => result.threadId);
  const metrics = calculateMetrics(
    returnedIds,
    testCase.expectedSimilar,
    testCase.expectedDissimilar,
  );

  return { testCase, metrics, results, error: null };
};

const runEvaluation = async (): Promise<number> => {
  const { testCases } = buildThreadSimilarityDataset();

  console.log("=".repeat(72));
  console.log("Thread Similarity Evaluation");
  console.log("=".repeat(72));
  console.log(`Organization ID: ${TEST_ORGANIZATION_ID}`);
  console.log(`Search limit: ${SEARCH_LIMIT}`);
  console.log(`Score threshold: ${SCORE_THRESHOLD}\n`);

  // Collect all candidate thread IDs and batch process them
  const candidateThreadIds = testCases.map((tc) => tc.candidateThreadId);
  console.log(`Batch processing ${candidateThreadIds.length} test cases...\n`);

  const batchResults = await batchFindSimilarThreads(candidateThreadIds, {
    organizationId: TEST_ORGANIZATION_ID,
    limit: SEARCH_LIMIT,
    scoreThreshold: SCORE_THRESHOLD,
  });

  const allMetrics: EvalMetrics[] = [];
  let passedCount = 0;

  for (const testCase of testCases) {
    console.log("=".repeat(72));
    console.log(`Test: ${testCase.description}`);
    console.log(`Candidate: ${testCase.candidateThreadId}`);
    console.log(`Expected similar: ${testCase.expectedSimilar.join(", ")}`);
    if (testCase.expectedDissimilar.length > 0) {
      console.log(
        `Expected dissimilar: ${testCase.expectedDissimilar.join(", ")}`,
      );
    }

    const { metrics, results, error } = evaluateTestCase(
      testCase,
      batchResults,
    );
    allMetrics.push(metrics);

    if (error) {
      console.log(`\n  ❌ ${error}`);
      console.log(`  Status: FAILED`);
      continue;
    }

    if (results.length > 0) {
      console.log("\nResults:");
      for (const result of results) {
        console.log(renderResultLine(result.threadId, result.score, testCase));
      }
    } else {
      console.log("\nResults: (no matches returned)");
    }

    console.log(`\nMetrics:`);
    console.log(`  Precision: ${(metrics.precision * 100).toFixed(1)}%`);
    console.log(`  Recall: ${(metrics.recall * 100).toFixed(1)}%`);

    if (metrics.missedSimilar.length > 0) {
      console.log(`  Missed: ${metrics.missedSimilar.join(", ")}`);
    }

    if (metrics.dissimilarHits.length > 0) {
      console.log(`  Wrongly included: ${metrics.dissimilarHits.join(", ")}`);
    }

    if (metrics.unexpectedResults.length > 0) {
      console.log(`  Other results: ${metrics.unexpectedResults.join(", ")}`);
    }

    const passed = metrics.recall >= 0.5 && metrics.dissimilarHits.length === 0;
    if (passed) {
      passedCount += 1;
    }
    console.log(`\nStatus: ${passed ? "✅ PASSED" : "❌ FAILED"}`);
  }

  const total = allMetrics.length;
  const avgPrecision =
    allMetrics.reduce((sum, metric) => sum + metric.precision, 0) / total;
  const avgRecall =
    allMetrics.reduce((sum, metric) => sum + metric.recall, 0) / total;

  console.log("\n" + "=".repeat(72));
  console.log("Evaluation Summary");
  console.log("=".repeat(72));
  console.log(`Tests passed: ${passedCount}/${total}`);
  console.log(`Average precision: ${(avgPrecision * 100).toFixed(1)}%`);
  console.log(`Average recall: ${(avgRecall * 100).toFixed(1)}%`);
  console.log("=".repeat(72));

  return passedCount === total ? 0 : 1;
};

runEvaluation()
  .then((exitCode) => process.exit(exitCode))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
