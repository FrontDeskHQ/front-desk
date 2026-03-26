import { createScorer } from "evalite";
import { Factuality, ClosedQA } from "autoevals";
import type {
  ToolSelectionTestCase,
  ProactiveToolTestCase,
  DraftQualityTestCase,
  ThreadReferenceTestCase,
} from "./agent-chat.dataset";

// ─── Tool Selection Accuracy ─────────────────────────────────────────────────

/**
 * Compares the set of tools called against the expected set.
 * Score = (correct tools) / max(expected count, actual count).
 * Penalizes both missing and extra tool calls.
 */
export const toolSelectionAccuracy = createScorer<
  ToolSelectionTestCase["input"],
  string[],
  ToolSelectionTestCase["expected"]
>({
  name: "Tool Selection Accuracy",
  description:
    "Checks whether the model called exactly the expected tools (order-independent)",
  scorer: ({ output, expected }) => {
    if (!expected) return { score: 0 };

    const expectedSet = new Set(expected.tools);
    const actualSet = new Set(output);

    if (expectedSet.size === 0 && actualSet.size === 0) {
      return {
        score: 1,
        metadata: { expected: [], actual: [], note: "correctly used no tools" },
      };
    }

    const correct = [...expectedSet].filter((t) => actualSet.has(t));
    const missing = [...expectedSet].filter((t) => !actualSet.has(t));
    const extra = [...actualSet].filter((t) => !expectedSet.has(t));

    const denominator = Math.max(expectedSet.size, actualSet.size);
    const score = denominator > 0 ? correct.length / denominator : 0;

    return {
      score,
      metadata: {
        expected: [...expectedSet],
        actual: [...actualSet],
        correct,
        missing,
        extra,
      },
    };
  },
});

// ─── Proactive Tool Usage ────────────────────────────────────────────────────

/**
 * Checks that the model proactively used required tools (mustInclude),
 * with bonus credit for optional tools (mayAlsoInclude).
 *
 * Score breakdown:
 * - 80% weight: all mustInclude tools were called
 * - 20% weight: bonus for mayAlsoInclude tools
 */
export const proactiveToolUsage = createScorer<
  ProactiveToolTestCase["input"],
  string[],
  ProactiveToolTestCase["expected"]
>({
  name: "Proactive Tool Usage",
  description:
    "Checks that the model proactively gathered context before acting",
  scorer: ({ output, expected }) => {
    if (!expected) return { score: 0 };

    const actualSet = new Set(output);
    const { mustInclude, mayAlsoInclude } = expected;

    const requiredHits = mustInclude.filter((t) => actualSet.has(t));
    const requiredScore =
      mustInclude.length > 0 ? requiredHits.length / mustInclude.length : 1;

    const bonusHits = mayAlsoInclude.filter((t) => actualSet.has(t));
    const bonusScore =
      mayAlsoInclude.length > 0 ? bonusHits.length / mayAlsoInclude.length : 1;

    const score = requiredScore * 0.8 + bonusScore * 0.2;

    return {
      score,
      metadata: {
        actualTools: [...actualSet],
        requiredHits,
        requiredMissing: mustInclude.filter((t) => !actualSet.has(t)),
        bonusHits,
        requiredScore,
        bonusScore,
      },
    };
  },
});

// ─── Draft Quality (autoevals wrappers) ──────────────────────────────────────

const closedQAScorer = ClosedQA.partial({
  criteria:
    "Evaluate this customer support draft reply. Score it based on: " +
    "(1) Professional and empathetic tone appropriate for customer support. " +
    "(2) Addresses the specific customer issue described in the thread. " +
    "(3) Does not hallucinate product features or policies not supported by the provided context. " +
    "(4) Provides actionable next steps or information. " +
    "(5) Appropriate length - not too terse, not too verbose.",
});

/**
 * Wraps autoevals ClosedQA as an evalite scorer.
 * Maps evalite's { input, output, expected } to autoevals' { input, output, expected }.
 */
export const draftQualityScorer = createScorer<
  DraftQualityTestCase["input"],
  string,
  string
>({
  name: "Draft Quality",
  description:
    "LLM-as-judge scoring draft tone, relevance, and professionalism",
  scorer: async ({ input, output, expected }) => {
    const result = await closedQAScorer({
      input: `Thread: "${input.thread.name}"\nMessages:\n${input.thread.messages.map((m) => `[${m.author}]: ${m.content}`).join("\n")}\n\nExpected draft behavior: ${expected}`,
      output,
    });
    return {
      score: result.score ?? 0,
      metadata: result.metadata,
    };
  },
});

/**
 * Wraps autoevals Factuality as an evalite scorer.
 * Checks that the draft is grounded in the thread context.
 */
export const draftFactualityScorer = createScorer<
  DraftQualityTestCase["input"],
  string,
  string
>({
  name: "Draft Factuality",
  description: "Checks that the draft is grounded in thread context",
  scorer: async ({ input, output, expected }) => {
    const context = input.thread.messages
      .map((m) => `[${m.author}]: ${m.content}`)
      .join("\n");
    const result = await Factuality({
      input: `Customer support thread:\n${context}\n\nExpected: ${expected}`,
      output,
      expected: expected ?? "",
    });
    return {
      score: result.score ?? 0,
      metadata: result.metadata,
    };
  },
});

// ─── Thread Reference Formatting ─────────────────────────────────────────────

/**
 * Deterministic scorer that checks thread references use [Name](thread:id) syntax.
 *
 * Scoring:
 * - 70% weight: coverage — what fraction of expected threads are properly linked
 * - 30% weight: no raw IDs — thread IDs never appear as plain text
 */
export const threadReferenceFormat = createScorer<
  ThreadReferenceTestCase["input"],
  string,
  ThreadReferenceTestCase["expected"]
>({
  name: "Thread Reference Format",
  description:
    "Checks that thread references use [Name](thread:id) markdown link syntax",
  scorer: ({ output, expected }) => {
    if (!expected || expected.threadIds.length === 0) {
      return { score: 1 };
    }

    const threadLinkPattern = /\[([^\]]+)\]\(thread:([^)]+)\)/g;
    const foundLinks = [...output.matchAll(threadLinkPattern)];
    const linkedIds = new Set(foundLinks.map((m) => m[2]));

    // Coverage: how many expected threads were properly linked
    const linked = expected.threadIds.filter((id) => linkedIds.has(id));
    const coverageScore = linked.length / expected.threadIds.length;

    // Raw ID check: strip all valid links, then check for raw thread IDs
    const textWithoutLinks = output.replace(threadLinkPattern, "");
    const rawIdHits = expected.threadIds.filter((id) =>
      textWithoutLinks.includes(id),
    );
    const noRawIdsScore = rawIdHits.length === 0 ? 1 : 0;

    const score = coverageScore * 0.7 + noRawIdsScore * 0.3;

    return {
      score,
      metadata: {
        expectedIds: expected.threadIds,
        linkedIds: [...linkedIds],
        properlyLinked: linked,
        missingLinks: expected.threadIds.filter((id) => !linkedIds.has(id)),
        rawIdHits,
        coverageScore,
        noRawIdsScore,
      },
    };
  },
});
