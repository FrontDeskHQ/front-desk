import { google } from "@ai-sdk/google";
import { computeUrgency } from "@workspace/schemas/signals";
import {
  createAILogger,
  createLogger,
  log,
} from "@workspace/utils/logging";
import { generateText, Output } from "ai";
import { ulid } from "ulid";
import { z } from "zod";
import { AI_PRICING } from "../lib/ai-pricing";
import { fetchClient } from "../lib/database/client";
import { searchSimilarThreads } from "../lib/qdrant/threads";

const SUGGESTION_TYPE_LINKED_PR = "linked_pr";
const MATCH_SCORE_THRESHOLD = 0.75;
const MAX_MATCHES = 3;
const MAX_LLM_CANDIDATES = 5;
const OPEN_STATUSES = [0, 1]; // Open, In Progress

export interface MatchPrToThreadsInput {
  embedding: number[];
  organizationId: string;
  prId: number;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  owner: string;
  repo: string;
  shortDescription: string;
  confidence: number;
}

export interface MatchPrToThreadsResult {
  matchedThreadIds: string[];
  suggestionsCreated: number;
  skippedAlreadyLinked: number;
  skippedLowConfidence: number;
}

export interface ThreadCandidate {
  threadId: string;
  title: string;
  shortDescription: string;
  score: number;
}

export interface MatchEvaluation {
  threadId: string;
  matches: boolean;
  confidence: "high" | "medium" | "low";
  reason: string;
  summary: string;
}

const matchEvaluationSchema = z.object({
  evaluations: z.array(
    z.object({
      threadId: z.string(),
      matches: z.boolean(),
      confidence: z.enum(["high", "medium", "low"]),
      reason: z
        .string()
        .describe(
          "One sentence explaining why this PR matches (or doesn't match) the thread.",
        ),
      summary: z
        .string()
        .describe(
          "One short markdown line, written as a statement to the support agent that resolution has shipped. MUST contain a markdown link to the PR in the form [<repo>#<prNumber>](<prUrl>). Frame it as 'a fix has shipped' / 'the requested feature has been addressed' — not as speculation. Examples: 'A fix for the reported login failure has shipped in [owner/repo#123](https://github.com/owner/repo/pull/123).' or 'The requested CSV export filter has been addressed by [owner/repo#456](https://github.com/owner/repo/pull/456).' Keep it under ~200 characters.",
        ),
    }),
  ),
});

export const evaluatePrThreadMatches = async (
  pr: {
    title: string;
    shortDescription: string;
    repo: string;
    prNumber: number;
    prUrl: string;
  },
  candidates: ThreadCandidate[],
  ai: ReturnType<typeof createAILogger>,
): Promise<MatchEvaluation[]> => {
  if (candidates.length === 0) return [];

  const candidatesText = candidates
    .map(
      (c, i) =>
        `Candidate ${i + 1} (ID: ${c.threadId}):\n  Title: ${c.title}\n  Description: ${c.shortDescription}`,
    )
    .join("\n\n");

  const prLink = `[${pr.repo}#${pr.prNumber}](${pr.prUrl})`;

  const { output } = await generateText({
    model: ai.wrap(google("gemini-3-flash-preview")),
    output: Output.object({ schema: matchEvaluationSchema }),
    prompt: `You are deciding whether a merged pull request resolves the user issue described in a support thread.

A MATCH means: shipping this PR would resolve, fix, or directly address what the user is asking about in the thread. Be VERY conservative - when in doubt, it's NOT a match.

COMMON FALSE POSITIVES TO AVOID:
- Same product area / feature but DIFFERENT problem
- Similar terminology but DIFFERENT root cause
- PR touches the same surface but does not fix the user's complaint
- Vague topical overlap is not enough — the PR must plausibly resolve the thread

PULL REQUEST:
Title: ${pr.title}
Summary: ${pr.shortDescription}
Markdown link to use: ${prLink}
Markdown link target URL (for reference, do not paste raw): ${pr.prUrl}

CANDIDATE THREADS:
${candidatesText}

For each candidate, produce:
1. matches / confidence — only "high" if you are CERTAIN this PR resolves that thread.
2. reason — one sentence explaining why it matches (or doesn't).
3. summary — ONE short markdown line aimed at a support agent, written as a statement that resolution has shipped (not speculation). It MUST embed the PR as a markdown link using exactly this form: ${prLink}. Do NOT paste the bare URL. Keep it under ~200 characters and reference what was fixed/added for THIS specific thread.
   Voice: declarative, past tense, resolution-shipped framing — e.g. "A fix for …", "The requested … has been addressed by …", "Support for … has shipped in …".
   Examples:
   - "A fix for the reported SSO 401 errors has shipped in ${prLink}."
   - "The requested CSV 'status' column has been added by ${prLink}."
   - "Support for the missing webhook retry behavior has shipped in ${prLink}."`,
  });

  return output.evaluations;
};

type SuggestionRow = {
  id: string;
  type: string;
  entityId: string;
  relatedEntityId: string | null;
  active: boolean;
  accepted: boolean;
  organizationId: string;
  resultsStr: string | null;
  metadataStr: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const LinkedPrResultsSchema = z.object({
  prId: z.number().optional(),
  prNumber: z.number(),
  prTitle: z.string(),
  prUrl: z.string(),
  repo: z.string(),
  confidence: z.number(),
  reasoning: z.string(),
});

type LinkedPrResults = z.infer<typeof LinkedPrResultsSchema>;

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
};

const parseResultsStr = (resultsStr: string | null): LinkedPrResults | null => {
  if (!resultsStr) return null;
  try {
    return LinkedPrResultsSchema.parse(JSON.parse(resultsStr));
  } catch {
    return null;
  }
};

/**
 * Store a linked_pr suggestion for a thread, respecting existing suggestions and dismissals.
 */
const ensurePrLinkInSummary = (
  summary: string,
  repo: string,
  prNumber: number,
  prUrl: string,
  reasoning: string,
): string => {
  const trimmed = summary.trim();
  if (trimmed && trimmed.includes(prUrl)) {
    return trimmed;
  }
  // LLM omitted the link (or returned empty) — fall back to a deterministic line
  return `[${repo}#${prNumber}](${prUrl}) — ${reasoning}`;
};

const storeLinkedPrSuggestion = async (params: {
  threadId: string;
  organizationId: string;
  prId: number;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  repo: string;
  confidence: number;
  reasoning: string;
  summary: string;
}): Promise<boolean> => {
  const {
    threadId,
    organizationId,
    prId,
    prNumber,
    prTitle,
    prUrl,
    repo,
    confidence,
    reasoning,
    summary: rawSummary,
  } = params;

  const summary = ensurePrLinkInSummary(
    rawSummary,
    repo,
    prNumber,
    prUrl,
    reasoning,
  );

  try {
    const existingSuggestions = (await fetchClient.query.suggestion
      .where({
        type: SUGGESTION_TYPE_LINKED_PR,
        entityId: threadId,
        organizationId,
      })
      .get()) as SuggestionRow[];

    // Check if a suggestion for the same PR already exists
    const existingForPr = existingSuggestions.find((s) => {
      const results = parseResultsStr(s.resultsStr);
      return results?.prNumber === prNumber && results?.repo === repo;
    });

    if (existingForPr) {
      // Respect agent dismissals
      if (!existingForPr.active) {
        return false;
      }

      // Update existing active suggestion with latest data
      await fetchClient.mutate.suggestion.update(existingForPr.id, {
        resultsStr: JSON.stringify({
          prId,
          prNumber,
          prTitle,
          prUrl,
          repo,
          confidence,
          reasoning,
        }),
        summary,
        reasoning,
        updatedAt: new Date(),
      });
      return true;
    }

    // Insert new suggestion
    const now = new Date();
    await fetchClient.mutate.suggestion.insert({
      id: ulid().toLowerCase(),
      type: SUGGESTION_TYPE_LINKED_PR,
      entityId: threadId,
      relatedEntityId: null,
      organizationId,
      active: true,
      accepted: false,
      resultsStr: JSON.stringify({
        prId,
        prNumber,
        prTitle,
        prUrl,
        repo,
        confidence,
        reasoning,
      }),
      metadataStr: null,
      summary,
      reasoning,
      suggestedActions: null,
      urgencyScore: computeUrgency({
        signalType: "linked_pr",
        ageHours: 0,
      }),
      createdAt: now,
      updatedAt: now,
    });

    return true;
  } catch (error) {
    log.error(
      "worker.match-pr-threads",
      `Failed to store linked_pr suggestion for thread ${threadId}: ${formatError(error)}`,
    );
    return false;
  }
};

/**
 * After a PR is embedded, search for semantically similar open threads
 * and create linked_pr suggestions for matches above the confidence threshold.
 */
export const matchPrToThreads = async (
  input: MatchPrToThreadsInput,
): Promise<MatchPrToThreadsResult> => {
  const result: MatchPrToThreadsResult = {
    matchedThreadIds: [],
    suggestionsCreated: 0,
    skippedAlreadyLinked: 0,
    skippedLowConfidence: 0,
  };

  const requestLog = createLogger({
    action: "worker.match-pr-threads",
    organizationId: input.organizationId,
    prRef: `${input.owner}/${input.repo}#${input.prNumber}`,
  });
  const ai = createAILogger(requestLog, { cost: AI_PRICING });

  try {
    // Search for similar open threads using the PR embedding
    const similarThreads = await searchSimilarThreads(input.embedding, {
      organizationId: input.organizationId,
      limit: MAX_LLM_CANDIDATES + 5, // Fetch extra to account for filtering
      scoreThreshold: MATCH_SCORE_THRESHOLD,
      statusFilter: OPEN_STATUSES,
    });

    if (similarThreads.length === 0) {
      return result;
    }

    const repo = `${input.owner}/${input.repo}`;

    // Filter out threads that already have a linked PR (batch fetch)
    const candidateIds = similarThreads.map((s) => s.threadId);
    let linkedThreadIds = new Set<string>();
    try {
      const existingThreads = (await fetchClient.query.thread
        .where({ id: { $in: candidateIds } })
        .get()) as Array<{ id: string; externalPrId: string | null }>;
      linkedThreadIds = new Set(
        existingThreads.filter((t) => t.externalPrId).map((t) => t.id),
      );
    } catch (error) {
      log.warn(
        "worker.match-pr-threads",
        `Failed to batch-fetch threads for PR link check, proceeding without filter: ${formatError(error)}`,
      );
    }

    const candidates: ThreadCandidate[] = [];
    for (const match of similarThreads) {
      if (candidates.length >= MAX_LLM_CANDIDATES) break;
      if (linkedThreadIds.has(match.threadId)) {
        result.skippedAlreadyLinked++;
        continue;
      }
      candidates.push({
        threadId: match.threadId,
        title: match.payload.title,
        shortDescription: match.payload.shortDescription,
        score: match.score,
      });
    }

    if (candidates.length === 0) {
      return result;
    }

    // LLM re-rank: verify each candidate actually describes an issue this PR fixes
    let evaluations: MatchEvaluation[] = [];
    try {
      evaluations = await evaluatePrThreadMatches(
        {
          title: input.prTitle,
          shortDescription: input.shortDescription,
          repo,
          prNumber: input.prNumber,
          prUrl: input.prUrl,
        },
        candidates,
        ai,
      );
    } catch (error) {
      log.error(
        "worker.match-pr-threads",
        `LLM evaluation failed for PR ${repo}#${input.prNumber}: ${formatError(error)}`,
      );
      return result;
    }

    // Pick best matches by similarity score, restricted to high-confidence positive evaluations
    const candidateByThreadId = new Map(candidates.map((c) => [c.threadId, c]));
    const confirmed = evaluations
      .filter((e) => e.matches && e.confidence === "high")
      .map((e) => ({ evaluation: e, candidate: candidateByThreadId.get(e.threadId) }))
      .filter((x): x is { evaluation: MatchEvaluation; candidate: ThreadCandidate } =>
        Boolean(x.candidate),
      )
      .sort((a, b) => b.candidate.score - a.candidate.score)
      .slice(0, MAX_MATCHES);

    result.skippedLowConfidence = candidates.length - confirmed.length;

    for (const { evaluation, candidate } of confirmed) {
      const stored = await storeLinkedPrSuggestion({
        threadId: candidate.threadId,
        organizationId: input.organizationId,
        prId: input.prId,
        prNumber: input.prNumber,
        prTitle: input.prTitle,
        prUrl: input.prUrl,
        repo,
        confidence: candidate.score,
        reasoning: evaluation.reason,
        summary: evaluation.summary,
      });

      if (!stored) continue;

      result.suggestionsCreated++;
      result.matchedThreadIds.push(candidate.threadId);
    }

    return result;
  } catch (error) {
    log.error(
      "worker.match-pr-threads",
      `Failed to match PR ${input.owner}/${input.repo}#${input.prNumber} to threads: ${formatError(error)}`,
    );
    return result;
  }
};
