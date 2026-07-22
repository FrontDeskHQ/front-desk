import { sanitizeAgentReadReasoning } from "@workspace/schemas/signals";
import { createScorer } from "evalite";

import type { SynthesisRawActionSet } from "../synthesize";
import type {
  SynthesisAgentEvalCase,
  SynthesisAgentEvalInput,
} from "./agent-dataset";

type In = SynthesisAgentEvalInput;
type Expected = SynthesisAgentEvalCase["expected"];
interface Out {
  raw: SynthesisRawActionSet;
  toolCalls: {
    read_thread: number;
    read_pr: number;
    search_documentation: number;
    read_documentation_page: number;
  };
}

export const requiredPrimaryKinds = createScorer<In, Out, Expected>({
  description: "Required action kinds are present in primary actions.",
  name: "Required Primary Kinds",
  scorer: ({ output, expected }) => {
    const requiredKinds = expected?.mustIncludePrimaryKinds ?? [];
    const primaryKinds = output.raw.primary.map((action) => action.kind);
    const missingKinds = requiredKinds.filter(
      (kind) => !primaryKinds.includes(kind)
    );
    return {
      score: missingKinds.length === 0 ? 1 : 0,
      metadata: { requiredKinds, primaryKinds, missingKinds },
    };
  },
});

export const forbiddenPrimaryKinds = createScorer<In, Out, Expected>({
  description: "Forbidden kinds should not appear in primary actions.",
  name: "Forbidden Primary Kinds",
  scorer: ({ output, expected }) => {
    const forbiddenKinds = expected?.mustExcludePrimaryKinds ?? [];
    if (forbiddenKinds.length === 0)
      return { score: 1, metadata: { skipped: true } };

    const primaryKinds = output.raw.primary.map((action) => action.kind);
    const foundForbidden = forbiddenKinds.filter((kind) =>
      primaryKinds.includes(kind)
    );
    return {
      score: foundForbidden.length === 0 ? 1 : 0,
      metadata: { forbiddenKinds, primaryKinds, foundForbidden },
    };
  },
});

export const nonEmptyPrimaryWhenExpected = createScorer<In, Out, Expected>({
  description:
    "Requires at least one primary action unless empty primary is explicitly allowed.",
  name: "Non Empty Primary",
  scorer: ({ output, expected }) => {
    if (expected?.allowEmptyPrimary) {
      return { score: 1, metadata: { skipped: true } };
    }
    return {
      score: output.raw.primary.length > 0 ? 1 : 0,
      metadata: { primaryCount: output.raw.primary.length },
    };
  },
});

export const sourceInputMessageValidity = createScorer<In, Out, Expected>({
  description:
    "sourceInputMessageId points to one of the input thread messages.",
  name: "Source Message Validity",
  scorer: ({ input, output }) => {
    const messageIds = new Set(
      input.synthesisInput.threadMessages.map((message) => message.id)
    );
    const valid = messageIds.has(output.raw.sourceInputMessageId);
    return {
      score: valid ? 1 : 0,
      metadata: {
        sourceInputMessageId: output.raw.sourceInputMessageId,
        knownMessageIds: [...messageIds],
      },
    };
  },
});

const genericReplyPatterns = [
  "here's what happened",
  "let me know if you need anything else",
  "we are looking into this",
  "thanks for reaching out",
];

const extractTokens = (text: string, re: RegExp): string[] =>
  Array.from(text.matchAll(re), (match) => match[0].toLowerCase());

export const replySubstance = createScorer<In, Out, Expected>({
  description:
    "When a reply is required, draft is non-trivial and avoids generic filler.",
  name: "Reply Substance",
  scorer: ({ output, expected }) => {
    if (!expected?.requiresReplyDraft)
      return { score: 1, metadata: { skipped: true } };

    const reply = output.raw.primary.find((action) => action.kind === "reply");
    if (!reply || reply.kind !== "reply") {
      return { score: 0, metadata: { reason: "missing_reply" } };
    }

    const draft = reply.draftMarkdown.trim();
    const lowerDraft = draft.toLowerCase();
    const hasGenericFiller = genericReplyPatterns.some((pattern) =>
      lowerDraft.includes(pattern)
    );
    const longEnough = draft.length >= 80;
    const containsExpectedToken =
      !expected.replyMustContainAny || expected.replyMustContainAny.length === 0
        ? true
        : expected.replyMustContainAny.some((token) =>
            lowerDraft.includes(token.toLowerCase())
          );

    return {
      score: !hasGenericFiller && longEnough && containsExpectedToken ? 1 : 0,
      metadata: {
        length: draft.length,
        hasGenericFiller,
        containsExpectedToken,
        expectedTokens: expected.replyMustContainAny ?? [],
        draftPreview: draft.slice(0, 140),
      },
    };
  },
});

export const minimumToolCalls = createScorer<In, Out, Expected>({
  description: "Satisfies expected minimum tool call counts per tool.",
  name: "Minimum Tool Calls",
  scorer: ({ output, expected }) => {
    const minimums = expected?.minToolCalls;
    if (!minimums) {
      return { score: 1, metadata: { skipped: true } };
    }
    const failures: string[] = [];
    if (
      typeof minimums.read_thread === "number" &&
      output.toolCalls.read_thread < minimums.read_thread
    ) {
      failures.push(`read_thread<${minimums.read_thread}`);
    }
    if (
      typeof minimums.read_pr === "number" &&
      output.toolCalls.read_pr < minimums.read_pr
    ) {
      failures.push(`read_pr<${minimums.read_pr}`);
    }
    if (
      typeof minimums.search_documentation === "number" &&
      output.toolCalls.search_documentation < minimums.search_documentation
    ) {
      failures.push(`search_documentation<${minimums.search_documentation}`);
    }
    if (
      typeof minimums.read_documentation_page === "number" &&
      output.toolCalls.read_documentation_page <
        minimums.read_documentation_page
    ) {
      failures.push(
        `read_documentation_page<${minimums.read_documentation_page}`
      );
    }
    return {
      score: failures.length === 0 ? 1 : 0,
      metadata: { minimums, actual: output.toolCalls, failures },
    };
  },
});

export const replyFactualityGuard = createScorer<In, Out, Expected>({
  description:
    "Penalizes potentially unsupported factual claims in replies (numbers/urls/forbidden phrases).",
  name: "Reply Factuality Guard",
  scorer: ({ input, output, expected }) => {
    if (!expected?.requiresReplyDraft) {
      return { score: 1, metadata: { skipped: true } };
    }

    const reply = output.raw.primary.find((action) => action.kind === "reply");
    if (!reply || reply.kind !== "reply") {
      return { score: 0, metadata: { reason: "missing_reply" } };
    }

    const replyText = reply.draftMarkdown.toLowerCase();
    const contextText = [
      input.synthesisInput.threadName ?? "",
      ...input.synthesisInput.threadMessages.map((message) => message.content),
      JSON.stringify(input.synthesisInput.summary ?? {}),
      JSON.stringify(input.synthesisInput.hints ?? {}),
    ]
      .join("\n")
      .toLowerCase();

    const replyNumbers = extractTokens(replyText, /\b\d+(?:\.\d+)?\b/g);
    const contextNumbers = new Set(
      extractTokens(contextText, /\b\d+(?:\.\d+)?\b/g)
    );
    const unsupportedNumbers = replyNumbers.filter(
      (numberToken) => !contextNumbers.has(numberToken)
    );

    const replyUrls = extractTokens(replyText, /https?:\/\/[^\s)]+/g);
    const contextUrls = new Set(
      extractTokens(contextText, /https?:\/\/[^\s)]+/g)
    );
    const unsupportedUrls = replyUrls.filter((url) => !contextUrls.has(url));

    const forbiddenHits =
      expected.forbiddenReplyPhrases?.filter((phrase) =>
        replyText.includes(phrase.toLowerCase())
      ) ?? [];

    const penalty =
      unsupportedNumbers.length * 0.2 +
      unsupportedUrls.length * 0.4 +
      forbiddenHits.length * 0.6;

    return {
      score: Math.max(0, 1 - penalty),
      metadata: {
        unsupportedNumbers,
        unsupportedUrls,
        forbiddenHits,
      },
    };
  },
});

const INTERNAL_REASONING_RE =
  /\b(?:hint\s+bag|hintbag|tool\s+calls?|read_thread|search_documentation|messageId\s*=)\b/i;
const CONFIDENCE_IN_REASONING_RE =
  /\b(?:confidence|similarity|hint score|urgency score)\s*[:=]?\s*(?:\d{1,3}(?:\.\d+)?%?|0?\.\d+)\b/i;
const RAW_ID_IN_REASONING_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|\(thread:[^)]+\)/i;

export const unrepliedThreadReplyCoupling = createScorer<In, Out, Expected>({
  description:
    "When the team has not replied yet, non-reply primary actions must include a reply and alternatives must be reply-only.",
  name: "Unreplied Thread Reply Coupling",
  scorer: ({ input, output }) => {
    if (input.synthesisInput.hasTeamReply) {
      return { score: 1, metadata: { skipped: true } };
    }

    const primaryKinds = output.raw.primary.map((action) => action.kind);
    const hasNonReply = primaryKinds.some((kind) => kind !== "reply");
    const hasReply = primaryKinds.includes("reply");
    if (hasNonReply && !hasReply) {
      return {
        score: 0,
        metadata: { reason: "primary_non_reply_without_reply", primaryKinds },
      };
    }

    const nonReplyAlternatives = (output.raw.alternatives ?? []).filter(
      (action) => action.kind !== "reply"
    );
    if (nonReplyAlternatives.length > 0) {
      return {
        score: 0,
        metadata: {
          reason: "non_reply_alternative",
          kinds: nonReplyAlternatives.map((action) => action.kind),
        },
      };
    }

    return { score: 1, metadata: { primaryKinds } };
  },
});

export const atMostOneLinkPr = createScorer<In, Out, Expected>({
  description:
    "A thread links a single PR: at most one link_pr across primary + alternatives (FRO-204).",
  name: "At Most One Link PR",
  scorer: ({ output }) => {
    const linkPrCount = [
      ...output.raw.primary,
      ...(output.raw.alternatives ?? []),
    ].filter((action) => action.kind === "link_pr").length;
    return {
      score: linkPrCount <= 1 ? 1 : 0,
      metadata: { linkPrCount },
    };
  },
});

export const expectedLinkPrUrl = createScorer<In, Out, Expected>({
  description:
    "When expectedLinkPrUrl is set, every emitted link_pr must use that exact URL (from read_pr).",
  name: "Expected Link PR URL",
  scorer: ({ output, expected }) => {
    const expectedUrl = expected?.expectedLinkPrUrl;
    if (!expectedUrl) {
      return { score: 1, metadata: { skipped: true } };
    }

    const linkPrUrls = [
      ...output.raw.primary,
      ...(output.raw.alternatives ?? []),
    ]
      .filter((action) => action.kind === "link_pr")
      .map((action) => (action.kind === "link_pr" ? action.prUrl : ""));

    if (linkPrUrls.length === 0) {
      return {
        score: 0,
        metadata: { reason: "missing_link_pr", expectedUrl },
      };
    }

    const mismatches = linkPrUrls.filter((url) => url !== expectedUrl);
    return {
      score: mismatches.length === 0 ? 1 : 0,
      metadata: { expectedUrl, linkPrUrls, mismatches },
    };
  },
});

export const reasoningUserSafe = createScorer<In, Out, Expected>({
  description:
    "Reasoning must not leak internal agent terms, confidence scores, or raw ids.",
  name: "Reasoning User Safe",
  scorer: ({ output }) => {
    const reasoning = sanitizeAgentReadReasoning(output.raw.reasoning);
    if (!reasoning.trim()) {
      return { score: 0, metadata: { reason: "empty_after_sanitize" } };
    }

    const violations: string[] = [];
    if (INTERNAL_REASONING_RE.test(reasoning)) {
      violations.push("internal_terms");
    }
    if (CONFIDENCE_IN_REASONING_RE.test(reasoning)) {
      violations.push("confidence_scores");
    }
    if (RAW_ID_IN_REASONING_RE.test(reasoning)) {
      violations.push("raw_ids");
    }

    return {
      score: violations.length === 0 ? 1 : 0,
      metadata: { violations, reasoningPreview: reasoning.slice(0, 200) },
    };
  },
});
