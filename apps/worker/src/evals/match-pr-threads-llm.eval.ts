import { createAILogger, createLogger } from "@workspace/utils/logging";
import {
  evaluatePrThreadMatches,
  type MatchEvaluation,
  type ThreadCandidate,
} from "../handlers/match-pr-threads";
import { AI_PRICING } from "../lib/ai-pricing";

/**
 * PR ↔ Thread LLM matcher eval
 *
 * Isolates the `evaluatePrThreadMatches` step (LLM re-rank) from vector search.
 * Each case feeds a PR plus a synthetic candidate list and asserts the model's
 * verdict on each candidate, plus that the summary contains the PR markdown link.
 *
 * Run with: bun run src/evals/match-pr-threads-llm.eval.ts
 */

const TEST_REPO = "acme/app";
const prUrl = (n: number) => `https://github.com/${TEST_REPO}/pull/${n}`;
const prLink = (n: number) => `[${TEST_REPO}#${n}](${prUrl(n)})`;

interface ExpectedCandidate {
  threadId: string;
  matches: boolean;
  /** If matches=true and required=true, the eval requires confidence === "high". */
  required?: boolean;
}

interface PrInput {
  title: string;
  shortDescription: string;
  prNumber: number;
}

interface TestCase {
  name: string;
  pr: PrInput;
  candidates: ThreadCandidate[];
  expected: ExpectedCandidate[];
}

// ─── Test cases ────────────────────────────────────────────────────────────

const CASES: TestCase[] = [
  // 1. Clear-cut match: PR and thread describe the exact same SSO failure.
  {
    name: "Direct match: SSO 401 fix vs SSO 401 thread",
    pr: {
      prNumber: 101,
      title: "Fix SSO authentication returning 401 for valid tokens",
      shortDescription:
        "SSO sign-in returned 401 for valid tokens after the IdP migration; fixed by accepting tokens from both old and new issuer URLs.",
    },
    candidates: [
      {
        threadId: "t-sso-401",
        title: "Can't sign in via SSO — getting 401",
        shortDescription:
          "User reports SSO login fails with 401 since last week, valid corporate account.",
        score: 0.86,
      },
    ],
    expected: [{ threadId: "t-sso-401", matches: true, required: true }],
  },

  // 2. Same area, different problem: PR fixes Google SSO; thread is about
  //    email/password reset. Should NOT match.
  {
    name: "False-positive trap: same area (auth), different problem",
    pr: {
      prNumber: 102,
      title: "Fix Google SSO callback dropping the state param",
      shortDescription:
        "Google OAuth callback was discarding the `state` parameter, causing the SSO handshake to fail intermittently.",
    },
    candidates: [
      {
        threadId: "t-pwd-reset",
        title: "Password reset email never arrives",
        shortDescription:
          "User can't sign in and the password reset email never lands in their inbox.",
        score: 0.78,
      },
    ],
    expected: [{ threadId: "t-pwd-reset", matches: false }],
  },

  // 3. Vague topical overlap: PR adds retry logic for one specific payment
  //    flow; thread says "payments sometimes fail" with no specifics.
  //    Should be cautious — not a high-confidence match.
  {
    name: "Vague overlap: payment retry vs generic 'payments fail'",
    pr: {
      prNumber: 103,
      title: "Add retry on Stripe SCA challenge timeouts",
      shortDescription:
        "Cards requiring SCA were failing when the 3DS challenge timed out; we now retry once on SCA timeout.",
    },
    candidates: [
      {
        threadId: "t-payments-vague",
        title: "Payments sometimes fail",
        shortDescription:
          "Customer says checkout fails 'sometimes', no card type, error code, or reproduction steps provided.",
        score: 0.77,
      },
    ],
    expected: [{ threadId: "t-payments-vague", matches: false }],
  },

  // 4. Mixed batch: one strong match, one unrelated, one same-area-distractor.
  {
    name: "Mixed batch: 1 match, 2 distractors",
    pr: {
      prNumber: 104,
      title: "Fix CSV export missing the 'status' column",
      shortDescription:
        "CSV exports were missing the `status` column. Added it back to the serializer.",
    },
    candidates: [
      {
        threadId: "t-csv-status",
        title: "CSV export missing status column",
        shortDescription:
          "Downloaded CSV no longer contains the status column for any thread row.",
        score: 0.88,
      },
      {
        threadId: "t-csv-timeout",
        title: "CSV export times out for large orgs",
        shortDescription:
          "Exports for orgs with >50k threads time out before the file is generated.",
        score: 0.74,
      },
      {
        threadId: "t-unrelated-mobile",
        title: "Mobile app crashes on iOS 17",
        shortDescription:
          "App crashes on launch on iPhones running iOS 17.4 or later.",
        score: 0.71,
      },
    ],
    expected: [
      { threadId: "t-csv-status", matches: true, required: true },
      { threadId: "t-csv-timeout", matches: false },
      { threadId: "t-unrelated-mobile", matches: false },
    ],
  },

  // 5. Internal-only PR (no user-facing impact): nothing should match,
  //    even if the candidate looks vaguely related.
  {
    name: "Internal-only PR rejects vaguely-related thread",
    pr: {
      prNumber: 105,
      title: "Refactor thread service into smaller modules",
      shortDescription:
        "Pure internal refactor: split `ThreadService` into 4 smaller modules. No behavior changes.",
    },
    candidates: [
      {
        threadId: "t-thread-load",
        title: "Threads load slowly",
        shortDescription:
          "Thread list takes 10+ seconds to load in the dashboard.",
        score: 0.76,
      },
    ],
    expected: [{ threadId: "t-thread-load", matches: false }],
  },

  // 6. Empty candidates → empty evaluations, no LLM call.
  {
    name: "Empty candidate list returns []",
    pr: {
      prNumber: 106,
      title: "Fix webhook retry backoff",
      shortDescription: "Webhook retries now use exponential backoff.",
    },
    candidates: [],
    expected: [],
  },

  // 7. Inverse direction: PR adds a feature, thread is a bug report for a
  //    different existing feature. Same product area (notifications) but
  //    add-vs-fix mismatch.
  {
    name: "Feature-add PR vs bug-report thread in same area",
    pr: {
      prNumber: 107,
      title: "Add Slack DM notification channel",
      shortDescription:
        "Adds a new opt-in Slack DM channel for thread notifications. Does not change existing email or in-app notifications.",
    },
    candidates: [
      {
        threadId: "t-email-notif-bug",
        title: "Not receiving email notifications for new replies",
        shortDescription:
          "User stopped getting email notifications when teammates reply on their threads.",
        score: 0.79,
      },
    ],
    expected: [{ threadId: "t-email-notif-bug", matches: false }],
  },

  // 8. Feature request directly addressed: thread asks for dark mode,
  //    PR ships dark mode. Summary should be feature-add framing
  //    ("has been addressed by"), not "a fix for".
  {
    name: "Feature request: dark mode ship matches dark-mode request",
    pr: {
      prNumber: 108,
      title: "Add system-wide dark mode",
      shortDescription:
        "Adds a fully themed dark mode across the app, including settings toggle and OS preference auto-detection.",
    },
    candidates: [
      {
        threadId: "t-feature-dark-mode",
        title: "Feature request: dark mode",
        shortDescription:
          "Customer asks for a dark mode option, says they work nights and the bright UI is hard on their eyes.",
        score: 0.83,
      },
    ],
    expected: [{ threadId: "t-feature-dark-mode", matches: true, required: true }],
  },

  // 9. Adjacent feature: thread asks for Slack integration, PR ships a
  //    Discord integration. Same shape of request (chat integration) but
  //    different platform — should NOT match.
  {
    name: "Adjacent feature: Discord PR does NOT satisfy Slack request",
    pr: {
      prNumber: 109,
      title: "Add Discord integration for thread notifications",
      shortDescription:
        "Ships a new Discord integration that posts new threads to a configured channel.",
    },
    candidates: [
      {
        threadId: "t-feature-slack",
        title: "Can we get Slack notifications for new threads?",
        shortDescription:
          "Team uses Slack and wants new-thread notifications posted to a Slack channel.",
        score: 0.81,
      },
    ],
    expected: [{ threadId: "t-feature-slack", matches: false }],
  },

  // 10. Partial feature request: thread asks for export to PDF + CSV +
  //     XLSX. PR ships only CSV export. Should NOT be a high-confidence
  //     match — most of the ask is still unaddressed.
  {
    name: "Partial feature: PR ships CSV only, request was CSV+PDF+XLSX",
    pr: {
      prNumber: 110,
      title: "Add CSV export for threads",
      shortDescription:
        "Adds a one-click CSV export for the thread list. PDF and Excel exports are not included in this change.",
    },
    candidates: [
      {
        threadId: "t-feature-multi-export",
        title: "Need export to CSV, PDF, and Excel",
        shortDescription:
          "Customer needs to export thread data in CSV, PDF, and Excel formats for compliance reporting.",
        score: 0.82,
      },
    ],
    expected: [{ threadId: "t-feature-multi-export", matches: false }],
  },

  // 11. Behavior-change PR (not a bug fix, not a new feature): tightens a
  //     default; thread is a complaint about the old behavior.
  {
    name: "Behavior change: default lowered to address complaint",
    pr: {
      prNumber: 111,
      title: "Lower default session timeout from 30 days to 7 days",
      shortDescription:
        "Changes the default session timeout to 7 days. Existing sessions are honored; the new default applies to new sessions.",
    },
    candidates: [
      {
        threadId: "t-session-too-long",
        title: "Sessions stay logged in for way too long",
        shortDescription:
          "Customer concerned that the 30-day session window is a security risk for shared devices.",
        score: 0.84,
      },
    ],
    expected: [{ threadId: "t-session-too-long", matches: true, required: true }],
  },

  // 12. Question-style thread ("how do I…?"): even if the PR adds the
  //     capability the user is asking about, an unresolved how-to is
  //     documentation territory, not a shipped resolution. Be cautious:
  //     low/medium confidence is fine, NOT a high-confidence match.
  {
    name: "How-to question is not resolved by a feature PR",
    pr: {
      prNumber: 112,
      title: "Add bulk-tag action to thread list",
      shortDescription:
        "Adds a bulk-tag action accessible from the thread list multi-select toolbar.",
    },
    candidates: [
      {
        threadId: "t-howto-tag",
        title: "How do I tag a bunch of threads at once?",
        shortDescription:
          "User is asking whether there's any way to apply a tag to many threads in one go.",
        score: 0.86,
      },
    ],
    expected: [{ threadId: "t-howto-tag", matches: false }],
  },

  // 13. API-shape feature request: thread wants webhook signatures; PR
  //     ships HMAC signing on outbound webhooks. Direct match.
  {
    name: "API feature: HMAC signing ships, matches signature request",
    pr: {
      prNumber: 113,
      title: "Sign outbound webhooks with HMAC-SHA256",
      shortDescription:
        "All outbound webhook deliveries are now signed with HMAC-SHA256 using the org's webhook secret. Adds X-Signature header.",
    },
    candidates: [
      {
        threadId: "t-feature-webhook-signing",
        title: "Please add signatures to webhooks",
        shortDescription:
          "Security team asking for signed webhook payloads so they can verify authenticity before processing.",
        score: 0.85,
      },
    ],
    expected: [
      { threadId: "t-feature-webhook-signing", matches: true, required: true },
    ],
  },

  // 14. Deprecation/removal PR vs feature-use thread: PR removes a
  //     feature the user is actively asking about. Same area, opposite
  //     direction — must not match.
  {
    name: "Deprecation PR does NOT match a feature-use thread",
    pr: {
      prNumber: 114,
      title: "Remove legacy v1 REST API",
      shortDescription:
        "Removes the deprecated v1 REST endpoints. v2 is the supported API going forward.",
    },
    candidates: [
      {
        threadId: "t-v1-usage",
        title: "v1 API returning unexpected 404s on /threads",
        shortDescription:
          "Customer hitting /v1/threads is getting sporadic 404s and wants help debugging.",
        score: 0.79,
      },
    ],
    expected: [{ threadId: "t-v1-usage", matches: false }],
  },
];

// ─── Runner ────────────────────────────────────────────────────────────────

interface CaseResult {
  name: string;
  passed: boolean;
  issues: string[];
  evaluations: MatchEvaluation[];
  duration: number;
}

const requestLog = createLogger({ action: "eval.match-pr-threads-llm" });
const ai = createAILogger(requestLog, { cost: AI_PRICING });

const expectedByThreadId = (tc: TestCase): Map<string, ExpectedCandidate> => {
  const m = new Map<string, ExpectedCandidate>();
  for (const e of tc.expected) m.set(e.threadId, e);
  return m;
};

const runCase = async (tc: TestCase): Promise<CaseResult> => {
  const start = performance.now();
  const issues: string[] = [];

  const evaluations = await evaluatePrThreadMatches(
    {
      title: tc.pr.title,
      shortDescription: tc.pr.shortDescription,
      repo: TEST_REPO,
      prNumber: tc.pr.prNumber,
      prUrl: prUrl(tc.pr.prNumber),
    },
    tc.candidates,
    ai,
  );

  if (tc.candidates.length === 0) {
    if (evaluations.length !== 0) {
      issues.push(
        `Empty candidates should return [], got ${evaluations.length} evaluations`,
      );
    }
    return {
      name: tc.name,
      passed: issues.length === 0,
      issues,
      evaluations,
      duration: performance.now() - start,
    };
  }

  // 1. Every candidate must be evaluated exactly once.
  const seen = new Set<string>();
  for (const e of evaluations) {
    if (seen.has(e.threadId)) {
      issues.push(`Duplicate evaluation for ${e.threadId}`);
    }
    seen.add(e.threadId);
  }

  const expected = expectedByThreadId(tc);
  for (const c of tc.candidates) {
    if (!seen.has(c.threadId)) {
      issues.push(`Missing evaluation for ${c.threadId}`);
    }
  }

  // 2. Each evaluation must agree with the expected verdict, and (if a
  //    required match) reach "high" confidence. Summaries on positive matches
  //    must contain the PR markdown link.
  const link = prLink(tc.pr.prNumber);
  for (const e of evaluations) {
    const exp = expected.get(e.threadId);
    if (!exp) {
      issues.push(`Unexpected evaluation for ${e.threadId}`);
      continue;
    }

    if (exp.matches && !e.matches) {
      issues.push(
        `${e.threadId}: expected match=true, got false (reason: ${e.reason})`,
      );
    }
    if (!exp.matches && e.matches && e.confidence === "high") {
      issues.push(
        `${e.threadId}: expected non-match, got high-confidence match (reason: ${e.reason})`,
      );
    }
    if (exp.matches && exp.required && e.confidence !== "high") {
      issues.push(
        `${e.threadId}: required high confidence, got ${e.confidence}`,
      );
    }

    // Summary checks — only enforced when the model claims a match (the
    // summary on a non-match isn't shown to anyone).
    if (e.matches) {
      if (!e.summary || e.summary.trim().length === 0) {
        issues.push(`${e.threadId}: empty summary on a positive match`);
      } else if (!e.summary.includes(prUrl(tc.pr.prNumber))) {
        issues.push(
          `${e.threadId}: summary missing PR URL (expected ${link}): "${e.summary}"`,
        );
      } else if (!e.summary.includes("](")) {
        issues.push(
          `${e.threadId}: summary contains URL but not as a markdown link: "${e.summary}"`,
        );
      }
      if (e.summary && e.summary.length > 300) {
        issues.push(
          `${e.threadId}: summary suspiciously long (${e.summary.length} chars)`,
        );
      }
    }

    if (!e.reason || e.reason.trim().length === 0) {
      issues.push(`${e.threadId}: empty reason`);
    }
  }

  return {
    name: tc.name,
    passed: issues.length === 0,
    issues,
    evaluations,
    duration: performance.now() - start,
  };
};

const main = async (): Promise<void> => {
  const startTime = performance.now();

  console.log("=".repeat(72));
  console.log("PR ↔ Thread LLM matcher eval");
  console.log(`${CASES.length} test cases`);
  console.log("=".repeat(72));

  const results: CaseResult[] = [];

  for (let i = 0; i < CASES.length; i++) {
    const tc = CASES[i]!;
    console.log(`\n[${i + 1}/${CASES.length}] ${tc.name}`);

    try {
      const result = await runCase(tc);
      results.push(result);

      const icon = result.passed ? "✅" : "❌";
      console.log(`  ${icon} ${(result.duration / 1000).toFixed(2)}s`);

      for (const e of result.evaluations) {
        console.log(
          `    - ${e.threadId}: matches=${e.matches} conf=${e.confidence}`,
        );
        console.log(`      reason:  ${e.reason}`);
        if (e.matches) console.log(`      summary: ${e.summary}`);
      }

      if (!result.passed) {
        for (const issue of result.issues) {
          console.log(`    ! ${issue}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        name: tc.name,
        passed: false,
        issues: [`EXCEPTION: ${message}`],
        evaluations: [],
        duration: 0,
      });
      console.log(`  💥 ${message}`);
    }
  }

  const totalTime = performance.now() - startTime;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  console.log(`\n${"=".repeat(72)}`);
  console.log("Results");
  console.log("-".repeat(72));
  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    console.log(`  ${icon} ${r.name}`);
    if (!r.passed) {
      for (const issue of r.issues) {
        console.log(`     - ${issue}`);
      }
    }
  }
  console.log("=".repeat(72));
  console.log(
    `${passed} passed, ${failed} failed out of ${results.length} (${(totalTime / 1000).toFixed(1)}s)`,
  );
  console.log("=".repeat(72));

  if (failed > 0) process.exit(1);
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
