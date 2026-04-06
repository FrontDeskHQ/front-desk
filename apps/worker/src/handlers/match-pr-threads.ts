import { ulid } from "ulid";
import { z } from "zod";
import { fetchClient } from "../lib/database/client";
import { searchSimilarThreads } from "../lib/qdrant/threads";

const SUGGESTION_TYPE_LINKED_PR = "linked_pr";
const MATCH_SCORE_THRESHOLD = 0.75;
const MAX_MATCHES = 3;
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
}

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
  } = params;

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
        prNumber,
        prTitle,
        prUrl,
        repo,
        confidence,
        reasoning,
      }),
      metadataStr: null,
      createdAt: now,
      updatedAt: now,
    });

    return true;
  } catch (error) {
    console.error(
      `Failed to store linked_pr suggestion for thread ${threadId}:`,
      error,
    );
    throw error;
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
  };

  try {
    // Search for similar open threads using the PR embedding
    const similarThreads = await searchSimilarThreads(input.embedding, {
      organizationId: input.organizationId,
      limit: MAX_MATCHES + 5, // Fetch extra to account for filtering
      scoreThreshold: MATCH_SCORE_THRESHOLD,
      statusFilter: OPEN_STATUSES,
    });

    if (similarThreads.length === 0) {
      return result;
    }

    const repo = `${input.owner}/${input.repo}`;
    let matchCount = 0;

    for (const match of similarThreads) {
      if (matchCount >= MAX_MATCHES) break;

      // Fetch the thread to check if it already has a linked PR
      try {
        const threads = await fetchClient.query.thread
          .where({ id: match.threadId })
          .get();

        const thread = threads[0] as
          | { id: string; externalPrId: string | null }
          | undefined;

        if (!thread) continue;

        if (thread.externalPrId) {
          result.skippedAlreadyLinked++;
          continue;
        }
      } catch (error) {
        console.warn(
          `Failed to fetch thread ${match.threadId} for PR link check, skipping:`,
          error,
        );
        continue;
      }

      // Create the suggestion
      const stored = await storeLinkedPrSuggestion({
        threadId: match.threadId,
        organizationId: input.organizationId,
        prId: input.prId,
        prNumber: input.prNumber,
        prTitle: input.prTitle,
        prUrl: input.prUrl,
        repo,
        confidence: match.score,
        reasoning: input.shortDescription,
      });

      if (!stored) {
        continue;
      }

      result.suggestionsCreated++;
      result.matchedThreadIds.push(match.threadId);
      matchCount++;
    }

    return result;
  } catch (error) {
    console.error(
      `Failed to match PR ${input.owner}/${input.repo}#${input.prNumber} to threads:`,
      error,
    );
    return result;
  }
};
