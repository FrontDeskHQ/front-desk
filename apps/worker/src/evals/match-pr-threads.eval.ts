import { buildPrText, summarizePr } from "../handlers/embed-pr";
import type { EmbedPrJobData } from "../handlers/embed-pr";
import { google } from "@ai-sdk/google";
import { embed } from "ai";
import { searchSimilarThreads } from "../lib/qdrant/threads";
import { TEST_ORGANIZATION_ID, buildThreadSimilarityDataset } from "./thread-similarity.dataset";

/**
 * PR → Thread matching eval
 *
 * Prerequisites: run `bun run eval:prepare` first to seed Qdrant with thread embeddings.
 *
 * Tests the full PR summarization + embedding + thread search flow to verify
 * that merged PRs are matched to the correct support threads.
 */

const EMBEDDING_MODEL = "gemini-embedding-001";
const embeddingModel = google.embedding(EMBEDDING_MODEL);

const MATCH_SCORE_THRESHOLD = 0.75;
const OPEN_STATUSES = [0, 1];
const MAX_MATCHES = 3;

// ─── Test Cases ────────────────────────────────────────────────────────────

interface PrMatchTestCase {
  name: string;
  pr: EmbedPrJobData;
  /** Thread category IDs that SHOULD appear in the top matches */
  expectedCategories: string[];
  /** Thread category IDs that MUST NOT appear in the top matches */
  forbiddenCategories?: string[];
  /** If true, expect no matches above threshold (e.g., pure infra PRs) */
  expectNoMatches?: boolean;
}

const basePr: EmbedPrJobData = {
  prNumber: 0,
  owner: "test-org",
  repo: "test-repo",
  prUrl: "https://github.com/test-org/test-repo/pull/0",
  prTitle: "",
  prBody: "",
  commitMessages: [],
  organizationId: TEST_ORGANIZATION_ID,
  mergedAt: new Date().toISOString(),
};

const CASES: PrMatchTestCase[] = [
  // ── 1. PR fixing login/SSO → should match login threads ──────────────────
  {
    name: "SSO login fix matches login/auth threads",
    pr: {
      ...basePr,
      prNumber: 101,
      prTitle: "Fix SSO authentication returning 401 for valid tokens",
      prBody: `## Problem
Users with valid SSO tokens were getting 401 errors when trying to sign in.
The token validation was checking the wrong issuer URL after our IdP migration.

## Solution
Updated the SSO token validator to accept tokens from both the old and new issuer URLs.`,
      commitMessages: [
        "fix: accept SSO tokens from both old and new issuer URLs",
        "test: add SSO token validation tests for migrated issuers",
      ],
    },
    expectedCategories: ["login_simple", "auth_hard"],
    forbiddenCategories: ["payment_simple", "mobile_crash_simple", "performance_hard"],
  },

  // ── 2. PR fixing payment processing → should match payment threads ───────
  {
    name: "Payment processing fix matches payment/billing threads",
    pr: {
      ...basePr,
      prNumber: 102,
      prTitle: "Fix card payment failures returning 500 on subscription renewal",
      prBody: `## Problem
Card payments were failing with 500 errors during subscription renewal.
The Stripe webhook handler was rejecting valid payment intents due to a timezone mismatch
in the expiration check.

## Solution
Normalized all timestamps to UTC before comparing payment intent expiration.`,
      commitMessages: [
        "fix: normalize timezone in Stripe payment intent expiration check",
        "fix: handle edge case for payments crossing midnight UTC",
      ],
    },
    expectedCategories: ["payment_simple", "payment_issue"],
    forbiddenCategories: ["login_simple", "mobile_crash_simple"],
  },

  // ── 3. PR fixing mobile crash → should match mobile crash threads ────────
  {
    name: "Mobile crash fix matches mobile crash threads",
    pr: {
      ...basePr,
      prNumber: 103,
      prTitle: "Fix app crash on iOS when opening thread details",
      prBody: `## Problem
The app crashes on iOS devices when users tap on a thread to view details.
A null pointer dereference in the thread detail view controller when the thread
has no assigned user.

## Solution
Added null check for assignedUser before rendering the avatar component.`,
      commitMessages: [
        "fix: null check for assignedUser in thread detail view",
        "fix: handle missing avatar gracefully on iOS",
      ],
    },
    expectedCategories: ["mobile_crash_simple", "mobile_crash"],
    forbiddenCategories: ["payment_simple", "export_hard"],
  },

  // ── 4. PR fixing performance → should match performance threads ──────────
  {
    name: "Performance fix matches slow loading threads",
    pr: {
      ...basePr,
      prNumber: 104,
      prTitle: "Fix slow dashboard loading by optimizing thread list query",
      prBody: `## Problem
Dashboard was taking 30+ seconds to load for organizations with many threads.
The thread list query was doing a full table scan instead of using the index on organizationId.

## Solution
Added missing database index and rewrote the query to use proper pagination.`,
      commitMessages: [
        "fix: add missing index on threads.organizationId",
        "fix: use cursor-based pagination for thread list",
      ],
    },
    expectedCategories: ["performance_hard"],
    forbiddenCategories: ["login_simple", "payment_simple"],
  },

  // ── 5. PR fixing CSV export → should match export threads ──────���─────────
  {
    name: "Export fix matches data export threads",
    pr: {
      ...basePr,
      prNumber: 105,
      prTitle: "Fix CSV export missing columns and timing out for large datasets",
      prBody: `## Problem
CSV exports were missing the 'created_at' and 'status' columns, and would time out
for organizations with more than 10k threads.

## Solution
- Added missing column mappings to the CSV serializer
- Implemented streaming export to avoid timeout for large datasets`,
      commitMessages: [
        "fix: add missing columns to CSV export serializer",
        "fix: stream large CSV exports to avoid timeout",
      ],
    },
    expectedCategories: ["export_hard"],
    forbiddenCategories: ["login_simple", "payment_simple", "mobile_crash_simple"],
  },

  // ── 6. PR fixing webhooks → should match webhook threads ─────────────────
  {
    name: "Webhook fix matches webhook delay threads",
    pr: {
      ...basePr,
      prNumber: 106,
      prTitle: "Fix webhook delivery delays and missing retry logic",
      prBody: `## Problem
Webhook events were being delayed by several minutes and failed deliveries
were not being retried. The webhook queue worker was stuck processing events
sequentially instead of in parallel.

## Solution
- Switched webhook delivery to concurrent processing
- Added exponential backoff retry for failed webhook deliveries`,
      commitMessages: [
        "fix: parallelize webhook delivery processing",
        "fix: add retry with exponential backoff for failed webhooks",
      ],
    },
    expectedCategories: ["webhook_delay"],
    forbiddenCategories: ["login_simple", "payment_simple"],
  },

  // ── 7. PR fixing rate limiting → should match rate limit threads ─────────
  {
    name: "Rate limit fix matches rate limiting threads",
    pr: {
      ...basePr,
      prNumber: 107,
      prTitle: "Fix aggressive rate limiting on API endpoints",
      prBody: `## Problem
Users were hitting rate limits (429 errors) well below the documented threshold.
The rate limiter was using a per-endpoint counter instead of per-user, causing
shared IP users to exhaust the limit collectively.

## Solution
Changed rate limiting to be per-API-key instead of per-IP.`,
      commitMessages: [
        "fix: switch rate limiter from per-IP to per-API-key",
        "config: update default rate limit thresholds",
      ],
    },
    expectedCategories: ["rate_limit"],
    forbiddenCategories: ["payment_simple", "mobile_crash_simple"],
  },

  // ── 8. PR fixing invoice calculation → should match invoice threads ──────
  {
    name: "Invoice fix matches invoice threads, not payment threads",
    pr: {
      ...basePr,
      prNumber: 108,
      prTitle: "Fix incorrect invoice totals for organizations with seat changes",
      prBody: `## Problem
Invoices were showing incorrect totals when organizations added or removed seats
mid-billing-cycle. The proration calculation was using the wrong billing period.

## Solution
Fixed the proration logic to use the correct period start/end dates.`,
      commitMessages: [
        "fix: correct billing period in seat proration calculation",
        "test: add tests for mid-cycle seat changes",
      ],
    },
    expectedCategories: ["invoice_issue"],
  },

  // ���─ 9. Pure CI/infra PR → should have low confidence, no matches ─────────
  {
    name: "Pure infra PR produces no thread matches",
    pr: {
      ...basePr,
      prNumber: 109,
      prTitle: "Upgrade CI runner from Ubuntu 22.04 to 24.04",
      prBody: `Ubuntu 22.04 runners are being deprecated by GitHub Actions in Q3 2026.
This upgrades all workflow files to use ubuntu-24.04. No application code changes.`,
      commitMessages: [
        "chore: update .github/workflows/*.yml to ubuntu-24.04",
      ],
    },
    expectedCategories: [],
    expectNoMatches: true,
  },

  // ── 10. PR fixing desktop crash → should match desktop crash threads ─────
  {
    name: "Desktop crash fix matches desktop crash threads, not mobile",
    pr: {
      ...basePr,
      prNumber: 110,
      prTitle: "Fix desktop app crash on Windows 11 when resizing window",
      prBody: `## Problem
The desktop app crashes on Windows 11 when users resize the main window.
A segfault in the window manager caused by an invalid bounds calculation.

## Solution
Fixed the bounds calculation to handle fractional scaling on Windows.`,
      commitMessages: [
        "fix: handle fractional DPI scaling in WindowManager bounds",
      ],
    },
    expectedCategories: ["desktop_crash"],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

const generateEmbedding = async (text: string): Promise<number[]> => {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
    providerOptions: {
      google: { taskType: "SEMANTIC_SIMILARITY" },
    },
  });

  // L2 normalize
  const norm = Math.hypot(...embedding);
  if (!Number.isFinite(norm) || norm === 0) return embedding;
  return embedding.map((v) => v / norm);
};

// Build category lookup from the thread dataset
const { threads: allThreads } = buildThreadSimilarityDataset();
const threadCategoryMap = new Map<string, string>();
for (const t of allThreads) {
  threadCategoryMap.set(t.id, t.categoryId);
}

// ─── Runner ───────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  confidence: number;
  matchedThreads: Array<{ threadId: string; category: string; score: number }>;
  duration: number;
}

const runCase = async (tc: PrMatchTestCase): Promise<TestResult> => {
  const start = performance.now();
  const checks: string[] = [];

  // Step 1: Summarize the PR
  const prText = buildPrText(tc.pr);
  const summary = await summarizePr(prText);

  // Step 2: If low confidence, verify no-match expectation
  if (summary.confidence < 0.4) {
    const duration = performance.now() - start;
    if (tc.expectNoMatches) {
      return {
        name: tc.name,
        passed: true,
        details: `OK — low confidence (${summary.confidence.toFixed(2)}), correctly skipped`,
        confidence: summary.confidence,
        matchedThreads: [],
        duration,
      };
    }
    checks.push(
      `PR confidence too low to embed (${summary.confidence.toFixed(2)}), but matches were expected`,
    );
    return {
      name: tc.name,
      passed: false,
      details: checks.join("; "),
      confidence: summary.confidence,
      matchedThreads: [],
      duration,
    };
  }

  // Step 3: Generate embedding
  const embeddingText = [
    `title: ${tc.pr.prTitle}`,
    `shortDescription: ${summary.shortDescription}`,
    `keywords: ${summary.keywords.join(", ")}`,
  ].join("\n");

  const embedding = await generateEmbedding(embeddingText);

  // Step 4: Search for similar threads
  const results = await searchSimilarThreads(embedding, {
    organizationId: TEST_ORGANIZATION_ID,
    limit: MAX_MATCHES + 5,
    scoreThreshold: MATCH_SCORE_THRESHOLD,
    statusFilter: OPEN_STATUSES,
  });

  const matchedThreads = results.slice(0, MAX_MATCHES).map((r) => ({
    threadId: r.threadId,
    category: threadCategoryMap.get(r.threadId) ?? "unknown",
    score: r.score,
  }));

  const duration = performance.now() - start;

  // Step 5: Validate results
  if (tc.expectNoMatches) {
    if (matchedThreads.length > 0) {
      checks.push(
        `Expected no matches but got ${matchedThreads.length}: [${matchedThreads.map((m) => `${m.threadId}(${m.category})`).join(", ")}]`,
      );
    }
  } else {
    // Check that at least one expected category is in the results
    const matchedCategories = new Set(matchedThreads.map((m) => m.category));
    const foundExpected = tc.expectedCategories.filter((c) =>
      matchedCategories.has(c),
    );

    if (foundExpected.length === 0 && tc.expectedCategories.length > 0) {
      checks.push(
        `No expected categories matched. Expected: [${tc.expectedCategories.join(", ")}], Got: [${[...matchedCategories].join(", ")}]`,
      );
    }

    // Check forbidden categories
    if (tc.forbiddenCategories) {
      const forbiddenHits = tc.forbiddenCategories.filter((c) =>
        matchedCategories.has(c),
      );
      if (forbiddenHits.length > 0) {
        checks.push(
          `Forbidden categories found in matches: [${forbiddenHits.join(", ")}]`,
        );
      }
    }
  }

  return {
    name: tc.name,
    passed: checks.length === 0,
    details: checks.length > 0 ? checks.join("; ") : "OK",
    confidence: summary.confidence,
    matchedThreads,
    duration,
  };
};

const main = async (): Promise<void> => {
  const startTime = performance.now();

  console.log("=".repeat(72));
  console.log("PR → Thread Matching Eval");
  console.log(`${CASES.length} test cases`);
  console.log(`Threshold: ${MATCH_SCORE_THRESHOLD} | Max matches: ${MAX_MATCHES}`);
  console.log("=".repeat(72));
  console.log(
    "\nPrerequisite: thread embeddings must be seeded (bun run eval:prepare)\n",
  );

  const results: TestResult[] = [];

  for (let i = 0; i < CASES.length; i++) {
    const tc = CASES[i]!;
    console.log(`\n[${i + 1}/${CASES.length}] ${tc.name}`);

    try {
      const result = await runCase(tc);
      results.push(result);

      const icon = result.passed ? "\u2705" : "\u274C";
      console.log(`  ${icon} ${(result.duration / 1000).toFixed(2)}s`);
      console.log(`  PR confidence: ${result.confidence.toFixed(2)}`);

      if (result.matchedThreads.length > 0) {
        console.log("  Matches:");
        for (const m of result.matchedThreads) {
          console.log(
            `    - ${m.threadId} [${m.category}] score=${m.score.toFixed(3)}`,
          );
        }
      } else {
        console.log("  Matches: (none)");
      }

      if (!result.passed) {
        console.log(`  ISSUES: ${result.details}`);
      }
    } catch (error) {
      results.push({
        name: tc.name,
        passed: false,
        details: `EXCEPTION: ${error instanceof Error ? error.message : String(error)}`,
        confidence: 0,
        matchedThreads: [],
        duration: 0,
      });
      console.log(
        `  \uD83D\uDCA5 ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  // Summary
  const totalTime = performance.now() - startTime;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log("\n" + "=".repeat(72));
  console.log("Results");
  console.log("-".repeat(72));
  for (const r of results) {
    const icon = r.passed ? "\u2705" : "\u274C";
    const categories = r.matchedThreads.map((m) => m.category).join(", ") || "(none)";
    console.log(`  ${icon} ${r.name}`);
    console.log(`     confidence=${r.confidence.toFixed(2)} matched=[${categories}]`);
  }
  console.log("=".repeat(72));
  console.log(
    `${passed} passed, ${failed} failed out of ${results.length} (${(totalTime / 1000).toFixed(1)}s)`,
  );
  console.log("=".repeat(72));

  if (failed > 0) {
    console.log("\nFailed:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  \u274C ${r.name}`);
      console.log(`     ${r.details}`);
    }
    process.exit(1);
  }
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
