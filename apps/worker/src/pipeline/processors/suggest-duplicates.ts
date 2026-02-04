import { google } from "@ai-sdk/google";
import { jsonContentToPlainText, safeParseJSON } from "@workspace/utils/tiptap";
import { generateText, Output } from "ai";
import { createHash } from "node:crypto";
import { ulid } from "ulid";
import z from "zod";
import { fetchClient } from "../../lib/database/client";
import type {
  ProcessorDefinition,
  ProcessorExecuteContext,
  ProcessorResult,
} from "../core/types";
import type { FindSimilarOutput } from "./find-similar";

const SUGGESTION_TYPE_DUPLICATE = "duplicate";
const MAX_CANDIDATES = 3;

export interface SuggestDuplicatesOutput {
  duplicateThreadId: string | null;
  evaluatedCount: number;
}

interface DuplicateEvaluation {
  threadId: string;
  isDuplicate: boolean;
  confidence: "high" | "medium" | "low";
  reason: string;
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

const resolveDuplicateTarget = async ({
  organizationId,
  candidateThreadId,
  currentThreadId,
}: {
  organizationId: string;
  candidateThreadId: string;
  currentThreadId: string;
}): Promise<string> => {
  const candidateSuggestions = (await fetchClient.query.suggestion
    .where({
      type: SUGGESTION_TYPE_DUPLICATE,
      entityId: candidateThreadId,
      organizationId,
    })
    .get()) as SuggestionRow[];

  const preferredSuggestion = candidateSuggestions.find(
    (suggestion) =>
      (suggestion.active || suggestion.accepted) &&
      suggestion.relatedEntityId &&
      suggestion.relatedEntityId !== currentThreadId
  );

  if (preferredSuggestion?.relatedEntityId) {
    return preferredSuggestion.relatedEntityId;
  }

  return candidateThreadId;
};

const computeSha256 = (data: string): string => {
  return createHash("sha256").update(data).digest("hex");
};

const evaluationSchema = z.object({
  evaluations: z.array(
    z.object({
      threadId: z.string(),
      isDuplicate: z.boolean(),
      confidence: z.enum(["high", "medium", "low"]),
      reason: z.string(),
    })
  ),
});

const evaluateDuplicates = async (
  currentThread: {
    title: string;
    firstMessageContent: string;
  },
  candidates: Array<{
    threadId: string;
    title: string;
    shortDescription: string;
    score: number;
  }>
): Promise<DuplicateEvaluation[]> => {
  if (candidates.length === 0) {
    return [];
  }

  const candidatesText = candidates
    .map(
      (c, i) =>
        `Candidate ${i + 1} (ID: ${c.threadId}):\n  Title: ${c.title}\n  Description: ${c.shortDescription}`
    )
    .join("\n\n");

  const { output: aiResult } = await generateText({
    model: google("gemini-3-flash-preview"),
    output: Output.object({
      schema: evaluationSchema,
    }),
    prompt: `You are a support ticket duplicate detector. Your job is to determine if the current thread is a DUPLICATE of any candidate threads.

CRITICAL: A duplicate means the threads describe the EXACT SAME problem with the SAME expected resolution. Be VERY conservative - when in doubt, it's NOT a duplicate.

COMMON FALSE POSITIVES TO AVOID:
- Same topic/category but DIFFERENT specific issues (e.g., "login fails with Google" vs "login fails with email" are NOT duplicates)
- Similar symptoms but DIFFERENT root causes
- Related features but DIFFERENT questions (e.g., "how to export data" vs "how to import data" are NOT duplicates)
- Same product area but DIFFERENT problems
- General similarity is NOT enough - the problem must be IDENTICAL

CURRENT THREAD:
Title: ${currentThread.title}
First Message: ${currentThread.firstMessageContent}

CANDIDATE THREADS:
${candidatesText}

For each candidate, evaluate:
1. Is it describing the EXACT SAME problem? (not just similar)
2. Would the resolution for one thread also resolve the other?
3. If you merged these tickets, would it make sense to a support agent?

Respond with your evaluation for each candidate. Only mark as duplicate with "high" confidence if you are CERTAIN they describe the identical issue.`,
  });

  return aiResult.evaluations;
};

export const suggestDuplicatesProcessor: ProcessorDefinition<SuggestDuplicatesOutput> =
  {
    name: "suggest-duplicates",

    dependencies: ["find-similar"],

    getIdempotencyKey(threadId: string): string {
      return `suggest-duplicates:${threadId}`;
    },

    computeHash(context: ProcessorExecuteContext): string {
      const { thread } = context;

      // Hash based on current thread's title + first message only
      // Does NOT consider similar thread IDs (no rerun when similar list changes)
      const messages = thread.messages ?? [];
      const sortedMessages = messages.sort((a, b) => a.id.localeCompare(b.id));
      const firstMessage = sortedMessages[0];
      const firstMessageContent = firstMessage
        ? jsonContentToPlainText(safeParseJSON(firstMessage.content))
        : "";

      const hashInput = [thread.id, thread.name || "", firstMessageContent].join(
        "|"
      );

      return computeSha256(hashInput);
    },

    async execute(
      context: ProcessorExecuteContext
    ): Promise<ProcessorResult<SuggestDuplicatesOutput>> {
      const { context: jobContext, thread, threadId } = context;
      const organizationId = thread.organizationId;

      try {
        console.log(`Suggesting duplicates for thread ${threadId}`);

        // Get similar threads from find-similar processor
        const findSimilarOutput =
          jobContext.getProcessorOutput<FindSimilarOutput>(
            "find-similar",
            threadId
          );

        if (!findSimilarOutput) {
          return {
            threadId,
            success: false,
            error: "No output available from find-similar processor",
          };
        }

        const { similarThreads } = findSimilarOutput;

        if (similarThreads.length === 0) {
          console.log(`No similar threads found for ${threadId}`);
          return {
            threadId,
            success: true,
            data: { duplicateThreadId: null, evaluatedCount: 0 },
          };
        }

        // Get current thread's createdAt timestamp
        const currentThreadCreatedAt = new Date(thread.createdAt).getTime();

        // Filter candidates: only threads OLDER than current thread
        const olderCandidates = similarThreads.filter((s) => {
          const candidateCreatedAt = s.payload.createdAt;
          return candidateCreatedAt < currentThreadCreatedAt;
        });

        if (olderCandidates.length === 0) {
          console.log(
            `No older similar threads found for ${threadId} (all candidates are newer)`
          );
          return {
            threadId,
            success: true,
            data: { duplicateThreadId: null, evaluatedCount: 0 },
          };
        }

        // Take top 3 candidates
        const candidates = olderCandidates.slice(0, MAX_CANDIDATES);

        // Prepare current thread data
        const messages = thread.messages ?? [];
        const sortedMessages = messages.sort((a, b) => a.id.localeCompare(b.id));
        const firstMessage = sortedMessages[0];
        const firstMessageContent = firstMessage
          ? jsonContentToPlainText(safeParseJSON(firstMessage.content))
          : "";

        const currentThreadData = {
          title: thread.name || "",
          firstMessageContent,
        };

        // Prepare candidate data
        const candidateData = candidates.map((c) => ({
          threadId: c.threadId,
          title: c.payload.title,
          shortDescription: c.payload.shortDescription,
          score: c.score,
        }));

        // Evaluate duplicates using LLM
        const evaluations = await evaluateDuplicates(
          currentThreadData,
          candidateData
        );

        // Find the best duplicate: high confidence only, then by similarity score
        let selectedDuplicate: {
          threadId: string;
          confidence: string;
          reason: string;
          score: number;
        } | null = null;

        for (const evaluation of evaluations) {
          if (evaluation.isDuplicate && evaluation.confidence === "high") {
            const candidate = candidates.find(
              (c) => c.threadId === evaluation.threadId
            );
            if (candidate) {
              if (
                !selectedDuplicate ||
                candidate.score > selectedDuplicate.score
              ) {
                selectedDuplicate = {
                  threadId: evaluation.threadId,
                  confidence: evaluation.confidence,
                  reason: evaluation.reason,
                  score: candidate.score,
                };
              }
            }
          }
        }

        let resolvedDuplicateThreadId: string | null = null;

        // Store suggestion if duplicate found
        if (selectedDuplicate) {
          const now = new Date();
          resolvedDuplicateThreadId = await resolveDuplicateTarget({
            organizationId,
            candidateThreadId: selectedDuplicate.threadId,
            currentThreadId: threadId,
          });

          // Check for existing suggestion
          const existingSuggestions = (await fetchClient.query.suggestion
            .where({
              type: SUGGESTION_TYPE_DUPLICATE,
              entityId: threadId,
              organizationId,
            })
            .get()) as SuggestionRow[];

          const existingForDuplicate = existingSuggestions.find(
            (s) => s.relatedEntityId === resolvedDuplicateThreadId
          );

          if (existingForDuplicate) {
            // Update existing suggestion
            await fetchClient.mutate.suggestion.update(existingForDuplicate.id, {
              active: existingForDuplicate.active,
              accepted: existingForDuplicate.accepted,
              resultsStr: JSON.stringify({
                confidence: selectedDuplicate.confidence,
                reason: selectedDuplicate.reason,
                score: selectedDuplicate.score,
              }),
              updatedAt: now,
            });
          } else {
            // Deactivate any other duplicate suggestions for this thread
            for (const existing of existingSuggestions) {
              if (existing.active) {
                await fetchClient.mutate.suggestion.update(existing.id, {
                  active: false,
                  updatedAt: now,
                });
              }
            }

            // Insert new suggestion
            await fetchClient.mutate.suggestion.insert({
              id: ulid().toLowerCase(),
              type: SUGGESTION_TYPE_DUPLICATE,
              entityId: threadId,
              relatedEntityId: resolvedDuplicateThreadId,
              organizationId,
              active: true,
              accepted: false,
              resultsStr: JSON.stringify({
                confidence: selectedDuplicate.confidence,
                reason: selectedDuplicate.reason,
                score: selectedDuplicate.score,
              }),
              metadataStr: null,
              createdAt: now,
              updatedAt: now,
            });
          }

          console.log(
            `Found duplicate for thread ${threadId}: ${resolvedDuplicateThreadId} (confidence: ${selectedDuplicate.confidence})`
          );
        } else {
          console.log(`No high-confidence duplicates found for thread ${threadId}`);
        }

        return {
          threadId,
          success: true,
          data: {
            duplicateThreadId: resolvedDuplicateThreadId,
            evaluatedCount: candidates.length,
          },
        };
      } catch (error) {
        console.error(
          `Suggest-duplicates processor failed for thread ${threadId}:`,
          error
        );
        return {
          threadId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
