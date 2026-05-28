import { ClosedQA, Factuality } from "autoevals";
import { createScorer } from "evalite";
import type { DraftReplyInput, DraftReplyResult } from "../draft";
import type { DraftExpectations } from "./dataset";

type In = DraftReplyInput;
type Out = DraftReplyResult;
type Expected = {
  description: string;
  expectations: DraftExpectations;
};

const renderContext = (input: In): string => {
  const transcript = input.recentMessages
    .map((m, i) => `${i + 1}. [${m.role}] ${m.content}`)
    .join("\n");
  const summaryBlock = input.summary
    ? `\nSummary: ${input.summary.shortDescription} (expected action: ${input.summary.expectedAction})`
    : "";
  return `Thread: "${input.threadName ?? "(none)"}"\nMessages:\n${transcript}${summaryBlock}`;
};

const closedQAScorer = ClosedQA.partial({
  criteria:
    "Evaluate this customer support draft reply. Score it based on: " +
    "(1) Professional and on-tone for the organization's voice. " +
    "(2) Directly addresses the latest inbound customer message. " +
    "(3) Does not hallucinate product features, prices, or policies absent from the context. " +
    "(4) Provides actionable next steps or a sensible clarifying question. " +
    "(5) Appropriate length — neither terse nor rambling.",
});

// ── Draft Factuality (LLM-as-judge) ───────────────────────────────────────
// Is anything asserted that the thread + summary do not support? Null drafts
// assert nothing, so they pass trivially (nullity is judged separately).
export const draftFactuality = createScorer<In, Out, Expected>({
  name: "Draft Factuality",
  description: "Draft is grounded in the thread context (no hallucinations).",
  scorer: async ({ input, output, expected }) => {
    if (output.draftMarkdown === null) {
      return { score: 1, metadata: { note: "null draft — nothing asserted" } };
    }
    const result = await Factuality({
      input: `Customer support thread:\n${renderContext(input)}\n\nExpected behavior: ${expected?.description ?? ""}`,
      output: output.draftMarkdown,
      expected: expected?.description ?? "",
    });
    return { score: result.score ?? 0, metadata: result.metadata };
  },
});

// ── Draft Quality (LLM-as-judge) ──────────────────────────────────────────
// Helpful, on-tone, addresses the latest inbound. Skipped (score 1) for drafts
// that are correctly null — those are graded by Null Candidate Accuracy.
export const draftQuality = createScorer<In, Out, Expected>({
  name: "Draft Quality",
  description: "Draft is helpful, on-tone, and addresses the latest inbound.",
  scorer: async ({ input, output, expected }) => {
    if (output.draftMarkdown === null) {
      return { score: 1, metadata: { note: "null draft — quality n/a" } };
    }
    const result = await closedQAScorer({
      input: `${renderContext(input)}\n\nExpected draft behavior: ${expected?.description ?? ""}`,
      output: output.draftMarkdown,
    });
    return { score: result.score ?? 0, metadata: result.metadata };
  },
});

// ── Keyword Hits (deterministic) ──────────────────────────────────────────
// Fraction of mustMention present; each mustNotMention present is a penalty.
export const keywordHits = createScorer<In, Out, Expected>({
  name: "Keyword Hits",
  description: "Fraction of required keywords present; penalty for forbidden.",
  scorer: ({ output, expected }) => {
    const { mustMention = [], mustNotMention = [] } =
      expected?.expectations ?? {};
    const text = (output.draftMarkdown ?? "").toLowerCase();

    if (output.draftMarkdown === null) {
      // A correctly-null draft can't and shouldn't surface keywords.
      const ok = expected?.expectations.mustBeNullCandidate === true;
      return {
        score: ok ? 1 : 0,
        metadata: { note: "null draft" },
      };
    }

    const hits = mustMention.filter((k) => text.includes(k.toLowerCase()));
    const base = mustMention.length > 0 ? hits.length / mustMention.length : 1;
    const forbidden = mustNotMention.filter((k) =>
      text.includes(k.toLowerCase()),
    );
    const score = Math.max(0, base - forbidden.length * 0.5);

    return {
      score,
      metadata: {
        hits,
        missing: mustMention.filter((k) => !text.includes(k.toLowerCase())),
        forbiddenPresent: forbidden,
      },
    };
  },
});

// ── No Sign-Off (deterministic) ───────────────────────────────────────────
// The drafter must emit only the reply body — the signature is appended
// separately. Penalize a trailing sign-off / closing salutation. We inspect the
// last two non-empty lines so legitimate body mentions ("contact our support
// team") don't trip the check.
const SIGN_OFF_PATTERNS: RegExp[] = [
  /\b(best|kind|warm|warmest)\s+regards\b/i,
  /\bbest\s+wishes\b/i,
  /\b(warm(est)?\s+)?regards\b/i,
  /\bsincerely\b/i,
  /\bcheers\b/i,
  /\byours\s+(truly|sincerely)\b/i,
  /\btake\s+care\b/i,
  /\btalk\s+soon\b/i,
  /^\s*thanks\s*[,!.]?\s*$/im, // "Thanks," on its own closing line
  /^\s*[-–—]\s*\S/m, // "- Jane" / "— The Team" dash signature
  /\bthe\b[\w\s'&-]{0,40}\bteam\b\s*$/im, // "... Support Team" at line end
];

const tailLines = (text: string): string => {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.slice(-2).join("\n");
};

export const noSignOff = createScorer<In, Out, Expected>({
  name: "No Sign-Off",
  description: "Draft body does not end with a sign-off / signature.",
  scorer: ({ output }) => {
    if (output.draftMarkdown === null) {
      return { score: 1, metadata: { note: "null draft" } };
    }
    const tail = tailLines(output.draftMarkdown);
    const matched = SIGN_OFF_PATTERNS.find((p) => p.test(tail));
    return {
      score: matched ? 0 : 1,
      metadata: { tail, matched: matched?.source },
    };
  },
});

// ── Null Candidate Accuracy (deterministic) ───────────────────────────────
// 1 if the draft's nullity matches mustBeNullCandidate (default: non-null).
export const nullCandidateAccuracy = createScorer<In, Out, Expected>({
  name: "Null Candidate Accuracy",
  description: "Draft nullity matches the expected mustBeNullCandidate flag.",
  scorer: ({ output, expected }) => {
    const expectedNull = expected?.expectations.mustBeNullCandidate === true;
    const actualNull = output.draftMarkdown === null;
    return {
      score: expectedNull === actualNull ? 1 : 0,
      metadata: { expectedNull, actualNull },
    };
  },
});
