import { summarizePr, buildPrText } from "../handlers/embed-pr";
import type { EmbedPrJobData } from "../handlers/embed-pr";

// ─── Test Cases ─────��──────────────────────────────���─────────────────────────

interface SummarizeTestCase {
  name: string;
  pr: EmbedPrJobData;
  /** Words/phrases that SHOULD appear in shortDescription or keywords (at least one must match) */
  expectAny: string[];
  /** Words/phrases that MUST NOT appear in shortDescription or keywords */
  forbid?: string[];
  /** Assert confidence >= 0.7 */
  expectHighConfidence?: boolean;
  /** Assert confidence < 0.4 (would be skipped by the pipeline) */
  expectLowConfidence?: boolean;
}

const basePr: EmbedPrJobData = {
  prNumber: 0,
  owner: "o",
  repo: "r",
  prUrl: "",
  prTitle: "",
  prBody: "",
  commitMessages: [],
  organizationId: "test",
  mergedAt: new Date().toISOString(),
};

const CASES: SummarizeTestCase[] = [
  // ── 1. Well-written PR ───────���─────────────────────────────────────────────
  {
    name: "Well-written PR extracts user-facing problem",
    pr: {
      ...basePr,
      prTitle: "Fix recording freeze on keyboard input during screen capture",
      prBody: `## Problem
When a user starts typing while screen recording is active, the recording freezes and becomes unresponsive.
The keyboard event listener was synchronously blocking the recording stream's frame capture loop.

## Solution
- Moved keyboard event handling to a separate async task queue
- Added debouncing to prevent rapid key presses from overwhelming the event pipeline`,
      commitMessages: [
        "fix: prevent keyboard event listener from blocking recording stream",
        "fix: add debounce to keyboard event pipeline",
      ],
    },
    expectAny: ["recording", "freeze", "keyboard", "typing", "screen capture"],
    forbid: ["event listener", "async task queue", "debounce", "pipeline"],
    expectHighConfidence: true,
  },

  // ── 2. Cryptic "misc fixes" PR — should be LOW confidence ─────────────────
  {
    name: "Cryptic PR scores low confidence (would be skipped)",
    pr: {
      ...basePr,
      prTitle: "misc fixes",
      prBody: "",
      commitMessages: ["stuff"],
    },
    expectAny: [],
    expectLowConfidence: true,
  },

  // ─�� 3. Title-only PR (no body, no commits) ────���───────────────────────────
  {
    name: "Title-only PR extracts meaning from title alone",
    pr: {
      ...basePr,
      prTitle: "Fix webhook timeout causing missed Slack notifications",
      prBody: "",
      commitMessages: [],
    },
    expectAny: ["webhook", "timeout", "notification", "slack"],
  },

  // ── 4. Implementation-heavy PR with buried user impact ────────────────────
  {
    name: "Implementation-heavy PR surfaces user-facing impact, not internals",
    pr: {
      ...basePr,
      prTitle: "Refactor ThreadPoolExecutor in async_worker.py to use bounded semaphore",
      prBody: `Replaces the unbounded thread pool with a bounded semaphore pattern.
The ThreadPoolExecutor was spawning unlimited threads under high load, causing OOM kills in production.
This manifested as users seeing "503 Service Unavailable" errors during peak hours when
the notification delivery service would crash.`,
      commitMessages: [
        "refactor: replace ThreadPoolExecutor with BoundedSemaphore",
        "config: set max_concurrency=50 in async_worker",
      ],
    },
    expectAny: ["503", "unavailable", "notification", "crash", "error", "outage", "downtime"],
    forbid: ["ThreadPoolExecutor", "BoundedSemaphore", "semaphore", "async_worker"],
  },

  // ── 5. Unicode / CJK / Emoji PR ─────────────────────────────────────��─────
  {
    name: "Unicode/CJK content doesn't break summarization",
    pr: {
      ...basePr,
      prTitle: "Fix CJK character rendering in PDF export 🐛",
      prBody: `PDF exports were corrupting CJK characters — users reported seeing □□□□ instead of their text.
Affected ~400 users in the APAC region.
Embedded the Noto Sans CJK font family into the PDF renderer.`,
      commitMessages: [
        "fix: embed Noto Sans CJK font in PDF renderer",
        "test: add CJK rendering tests for PDF export",
      ],
    },
    expectAny: ["pdf", "character", "cjk", "export", "rendering", "font"],
    expectHighConfidence: true,
  },

  // ── 6. Intentionally vague security fix ───────��────────────────────────────
  {
    name: "Vague security PR still extracts security-related keywords",
    pr: {
      ...basePr,
      prTitle: "Security: patch authentication bypass",
      prBody: `Patches a critical authentication bypass. Details in the private security advisory.
DO NOT include specifics in the commit message or changelog.`,
      commitMessages: ["fix: patch auth validation (see security advisory SA-2026-003)"],
    },
    expectAny: ["auth", "security", "bypass", "login", "access"],
  },

  // ── 7. Pure infra / CI change — should be LOW confidence ──────────────────
  {
    name: "Pure infra PR scores low confidence (would be skipped)",
    pr: {
      ...basePr,
      prTitle: "Upgrade CI runner from Ubuntu 22.04 to 24.04",
      prBody: `Ubuntu 22.04 runners are being deprecated by GitHub Actions in Q3 2026.
This upgrades all workflow files to use ubuntu-24.04. No application code changes.`,
      commitMessages: [
        "chore: update .github/workflows/*.yml to ubuntu-24.04",
        "chore: pin Node.js version in CI to 20.x",
      ],
    },
    expectAny: ["ci", "ubuntu", "runner", "upgrade", "github actions", "workflow"],
    forbid: ["crash", "error", "fix", "bug", "broken"],
    expectLowConfidence: true,
  },

  // ── 8. User-language PR about photo upload crash ──────��────────────────────
  {
    name: "User-language PR about photo upload crash",
    pr: {
      ...basePr,
      prTitle: "Fix app crash when uploading photos from gallery",
      prBody: `Users reported that the app crashes after selecting a photo from their gallery.
This only happens with HEIF format photos from newer iPhones. Added HEIF/HEIC support.`,
      commitMessages: [
        "fix: add HEIF/HEIC format support to image upload pipeline",
        "fix: handle null EXIF data for HEIF images",
      ],
    },
    expectAny: ["crash", "photo", "upload", "image", "heif", "gallery"],
    forbid: ["EXIF", "pipeline", "null"],
    expectHighConfidence: true,
  },

  // ── 9. Developer-language PR about the same HEIF bug ──────────────────────
  {
    name: "Developer-language PR about the same HEIF bug extracts similar concepts",
    pr: {
      ...basePr,
      prTitle: "Fix null pointer dereference in ImageProcessor pipeline for HEIF",
      prBody: `ImageProcessor.transform() threw NullReferenceException when the input
codec was HEIF because HeifDecoder wasn't registered in the codec registry.`,
      commitMessages: [
        "fix: register HEIF decoder in codec_registry.rs",
        "fix: add null guard for unregistered codec in ImageProcessor.transform()",
      ],
    },
    expectAny: ["image", "heif", "photo", "upload", "processing", "format"],
    forbid: ["NullReferenceException", "codec_registry", "ImageProcessor"],
  },

  // ── 10. Enormous PR body that exceeds truncation ───────��──────────────────
  {
    name: "Enormous PR body is truncated and still summarized",
    pr: {
      ...basePr,
      prTitle: "Migrate billing system from Stripe v2 to v3 API",
      prBody:
        "This PR migrates the entire billing infrastructure.\n\n" +
        "- Updated subscription management endpoint\n".repeat(500),
      commitMessages: Array.from(
        { length: 50 },
        (_, i) => `chore: migrate billing endpoint ${i + 1}/50`,
      ),
    },
    expectAny: ["billing", "stripe", "migration", "subscription", "payment"],
  },

  // ── 11. PR where title contradicts body ───────────────────────────────────
  {
    name: "Misleading title — body tells the real story",
    pr: {
      ...basePr,
      prTitle: "Small cleanup",
      prBody: `Despite the title, this actually fixes a critical bug where password reset emails
were being sent to the wrong email address. The user's old email was being used instead of
their updated email after an email change. This caused users to be locked out of their accounts.`,
      commitMessages: [
        "fix: use updated email address for password reset",
        "test: verify password reset uses current email",
      ],
    },
    expectAny: ["password reset", "email", "locked out", "wrong email", "account"],
    forbid: ["cleanup"],
    expectHighConfidence: true,
  },

  // ─��� 12. Multi-issue PR touching several things ────────────────────────────
  {
    name: "Multi-issue PR captures all distinct fixes",
    pr: {
      ...basePr,
      prTitle: "Fix multiple customer-reported issues from v2.4 release",
      prBody: `Addresses three separate bugs reported after the v2.4 release:

1. **Dark mode**: Toggle switch not persisting across page reloads. LocalStorage key was being overwritten by theme initialization.
2. **CSV export**: Exported files had wrong date format (MM/DD/YYYY instead of user's locale preference).
3. **Search**: Search results were not updating when filters were changed without pressing Enter. The debounced search was not triggering on filter change events.`,
      commitMessages: [
        "fix: persist dark mode toggle in localStorage correctly",
        "fix: use locale-aware date format in CSV export",
        "fix: trigger search on filter change without requiring Enter",
      ],
    },
    expectAny: ["dark mode", "csv", "export", "search", "filter", "date format"],
    expectHighConfidence: true,
  },
];

// ─── Runner ──���───────────────────────────��───────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  shortDescription: string;
  keywords: string[];
  confidence: number;
  duration: number;
}

const runCase = async (tc: SummarizeTestCase): Promise<TestResult> => {
  const start = performance.now();
  const prText = buildPrText(tc.pr);
  const summary = await summarizePr(prText);
  const duration = performance.now() - start;

  const allText = [
    summary.shortDescription.toLowerCase(),
    ...summary.keywords.map((k) => k.toLowerCase()),
  ].join(" ");

  const checks: string[] = [];

  // Must produce non-empty output
  if (!summary.shortDescription || summary.shortDescription.trim().length < 5) {
    checks.push("shortDescription is empty or too short");
  }

  // At least one expected term must appear (if any are specified)
  if (tc.expectAny.length > 0) {
    const matched = tc.expectAny.filter((term) =>
      allText.includes(term.toLowerCase()),
    );
    if (matched.length === 0) {
      checks.push(
        `None of the expected terms found: [${tc.expectAny.join(", ")}]`,
      );
    }
  }

  // Forbidden terms must NOT appear
  if (tc.forbid) {
    const violated = tc.forbid.filter((term) =>
      allText.includes(term.toLowerCase()),
    );
    if (violated.length > 0) {
      checks.push(
        `Forbidden terms found in output: [${violated.join(", ")}]`,
      );
    }
  }

  // Keywords should not exceed the 7 max
  if (summary.keywords.length > 7) {
    checks.push(`Too many keywords: ${summary.keywords.length} (max 7)`);
  }

  // Confidence assertions
  if (tc.expectHighConfidence && summary.confidence < 0.7) {
    checks.push(
      `Expected high confidence (>= 0.7), got ${summary.confidence.toFixed(2)}`,
    );
  }
  if (tc.expectLowConfidence && summary.confidence >= 0.4) {
    checks.push(
      `Expected low confidence (< 0.4), got ${summary.confidence.toFixed(2)}`,
    );
  }

  return {
    name: tc.name,
    passed: checks.length === 0,
    details: checks.length > 0 ? checks.join("; ") : "OK",
    shortDescription: summary.shortDescription,
    keywords: summary.keywords,
    confidence: summary.confidence,
    duration,
  };
};

const main = async (): Promise<void> => {
  const startTime = performance.now();

  console.log("=".repeat(72));
  console.log("PR Summarization Eval");
  console.log(`${CASES.length} test cases`);
  console.log("=".repeat(72));

  const results: TestResult[] = [];

  for (let i = 0; i < CASES.length; i++) {
    const tc = CASES[i];
    console.log(`\n[${i + 1}/${CASES.length}] ${tc.name}`);

    try {
      const result = await runCase(tc);
      results.push(result);

      const icon = result.passed ? "✅" : "❌";
      console.log(`  ${icon} ${(result.duration / 1000).toFixed(2)}s`);
      console.log(`  Confidence: ${result.confidence.toFixed(2)}`);
      console.log(`  Summary:    "${result.shortDescription}"`);
      console.log(`  Keywords:   [${result.keywords.join(", ")}]`);
      if (!result.passed) {
        console.log(`  ISSUES:     ${result.details}`);
      }
    } catch (error) {
      results.push({
        name: tc.name,
        passed: false,
        details: `EXCEPTION: ${error instanceof Error ? error.message : String(error)}`,
        shortDescription: "",
        keywords: [],
        confidence: 0,
        duration: 0,
      });
      console.log(`  💥 ${error instanceof Error ? error.message : error}`);
    }
  }

  // Summary table
  const totalTime = performance.now() - startTime;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log("\n" + "=".repeat(72));
  console.log("Confidence Scores");
  console.log("-".repeat(72));
  for (const r of results) {
    const bar = "█".repeat(Math.round(r.confidence * 20)).padEnd(20, "░");
    const icon = r.passed ? "✅" : "❌";
    console.log(
      `  ${icon} ${r.confidence.toFixed(2)} ${bar}  ${r.name}`,
    );
  }
  console.log("=".repeat(72));
  console.log(
    `${passed} passed, ${failed} failed out of ${results.length} (${(totalTime / 1000).toFixed(1)}s)`,
  );
  console.log("=".repeat(72));

  if (failed > 0) {
    console.log("\nFailed:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ❌ ${r.name}`);
      console.log(`     ${r.details}`);
    }
    process.exit(1);
  }
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
