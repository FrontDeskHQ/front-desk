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

const SUGGESTION_TYPE_LABEL = "label";

export interface SuggestLabelsOutput {
  labelIds: string[];
  cached: boolean;
}

type Label = {
  id: string;
  name: string;
  enabled: boolean;
  organizationId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type SuggestionMetadata = {
  hash?: string;
  dismissed?: string[];
  accepted?: string[];
};

const computeSha256 = (data: string): string => {
  return createHash("sha256").update(data).digest("hex");
};

const generateContentHash = (
  thread: ProcessorExecuteContext["thread"],
  labels: Label[],
): string => {
  const messages = thread.messages ?? [];
  // Using only the first 5 messages is on purpose to avoid to keep the hash valid on long threads.
  const messageContents = messages
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((m) => jsonContentToPlainText(safeParseJSON(m.content)))
    .filter((text) => text.trim().length > 0)
    .slice(0, 5)
    .join("|");

  const enabledLabels = labels
    .filter((l) => l.enabled)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((l) => `${l.id}:${l.name}`)
    .join("|");

  const labelTimestamps = labels
    .map((l) => {
      const createdAt =
        l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt;
      const updatedAt =
        l.updatedAt instanceof Date ? l.updatedAt.toISOString() : l.updatedAt;
      return `${createdAt}:${updatedAt}`;
    })
    .sort()
    .join("|");

  const threadCreatedAt =
    thread.createdAt instanceof Date
      ? thread.createdAt.toISOString()
      : thread.createdAt;

  const content = [
    thread.id,
    thread.name,
    threadCreatedAt,
    messageContents,
    enabledLabels,
    labelTimestamps,
  ].join("||");

  return createHash("sha256").update(content).digest("hex");
};

const generateLabelSuggestions = async (
  thread: ProcessorExecuteContext["thread"],
  labels: Label[],
): Promise<string[]> => {
  const enabledLabels = labels.filter((l) => l.enabled);

  if (enabledLabels.length === 0) {
    return [];
  }

  const messages = thread.messages ?? [];
  const messageContents = messages
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((m) => jsonContentToPlainText(safeParseJSON(m.content)))
    .filter((text) => text.trim().length > 0);

  const threadContent = [
    `Thread: ${thread.name}`,
    "",
    "Messages:",
    ...messageContents.map((content, i) => `${i + 1}. ${content}`),
  ].join("\n");

  const availableLabels = enabledLabels.map((l) => ({
    id: l.id,
    name: l.name,
  }));

  const { output: aiResult } = await generateText({
    model: google("gemini-3-flash-preview"),
    output: Output.object({
      schema: z.object({
        labelIds: z
          .array(z.string())
          .describe("Array of label IDs that are relevant to this thread"),
      }),
    }),
    prompt: `You are a helpful assistant that categorizes support threads with appropriate labels.

Given the following thread content, suggest relevant labels from the available labels list.
Only suggest labels that are truly relevant to the thread content.
Do not suggest more than 3 labels unless absolutely necessary.
If no labels are relevant, return an empty array.

${threadContent}

Available Labels:
${availableLabels.map((l) => `- ${l.name} (ID: ${l.id})`).join("\n")}

Return only label IDs that are most relevant to this thread.`,
  });

  const validLabelIds = new Set(enabledLabels.map((l) => l.id));
  return aiResult.labelIds.filter((id) => validLabelIds.has(id));
};

const getSuggestionMetadata = (
  metadataStr: string | null | undefined,
): SuggestionMetadata => {
  if (!metadataStr) {
    return { dismissed: [], accepted: [] };
  }
  try {
    return JSON.parse(metadataStr) as SuggestionMetadata;
  } catch {
    return { dismissed: [], accepted: [] };
  }
};

const filterDismissedLabels = (
  labelIds: string[],
  dismissedIds: string[],
): string[] => {
  const dismissedSet = new Set(dismissedIds);
  return labelIds.filter((id) => !dismissedSet.has(id));
};

const createSuggestionMetadata = (
  hash: string,
  dismissed: string[] = [],
  accepted: string[] = [],
): string => {
  return JSON.stringify({ hash, dismissed, accepted });
};

export const suggestLabelsProcessor: ProcessorDefinition<SuggestLabelsOutput> =
  {
    name: "suggest-labels",

    dependencies: [],

    getIdempotencyKey(threadId: string): string {
      return `suggest-labels:${threadId}`;
    },

    computeHash(context: ProcessorExecuteContext): string {
      const { thread } = context;

      const messages = thread.messages ?? [];
      const messageContents = messages
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((m) => jsonContentToPlainText(safeParseJSON(m.content)))
        .filter((text) => text.trim().length > 0)
        .slice(0, 5)
        .join("|");

      const hashInput = [thread.id, thread.name || "", messageContents].join(
        "|",
      );

      return computeSha256(hashInput);
    },

    async execute(
      context: ProcessorExecuteContext,
    ): Promise<ProcessorResult<SuggestLabelsOutput>> {
      const { thread, threadId } = context;
      const organizationId = thread.organizationId;

      try {
        console.log(`Suggesting labels for thread ${threadId}`);

        const labelsResponse = await fetchClient.query.label
          .where({ organizationId })
          .get();
        const allLabels = labelsResponse as Label[];
        const enabledLabels = allLabels.filter((l) => l.enabled);

        if (enabledLabels.length === 0) {
          console.log(
            `No enabled labels found for organization ${organizationId}`,
          );
          return {
            threadId,
            success: true,
            data: { labelIds: [], cached: false },
          };
        }

        const currentHash = generateContentHash(thread, allLabels);

        const existingSuggestion = await fetchClient.query.suggestion
          .first({
            type: SUGGESTION_TYPE_LABEL,
            entityId: threadId,
            organizationId,
          })
          .get();

        const existingMetadata = getSuggestionMetadata(
          existingSuggestion?.metadataStr,
        );

        if (existingSuggestion && existingMetadata.hash === currentHash) {
          const results = existingSuggestion.resultsStr
            ? (JSON.parse(existingSuggestion.resultsStr) as string[])
            : [];

          const validLabelIds = new Set(enabledLabels.map((l) => l.id));
          const filteredResults = filterDismissedLabels(
            results.filter((id) => validLabelIds.has(id)),
            existingMetadata.dismissed ?? [],
          );

          console.log(
            `Using cached label suggestions for thread ${threadId}: ${filteredResults.length} labels`,
          );
          return {
            threadId,
            success: true,
            data: { labelIds: filteredResults, cached: true },
          };
        }

        const suggestedLabelIds = await generateLabelSuggestions(
          thread,
          allLabels,
        );

        const filteredSuggestedLabelIds = filterDismissedLabels(
          suggestedLabelIds,
          existingMetadata.dismissed ?? [],
        );

        const now = new Date();
        const metadataStr = createSuggestionMetadata(
          currentHash,
          existingMetadata.dismissed ?? [],
          existingMetadata.accepted ?? [],
        );

        if (existingSuggestion) {
          await fetchClient.mutate.suggestion.update(existingSuggestion.id, {
            resultsStr: JSON.stringify(suggestedLabelIds),
            metadataStr,
            updatedAt: now,
          });
        } else {
          await fetchClient.mutate.suggestion.insert({
            id: ulid().toLowerCase(),
            type: SUGGESTION_TYPE_LABEL,
            entityId: threadId,
            organizationId,
            resultsStr: JSON.stringify(suggestedLabelIds),
            metadataStr,
            createdAt: now,
            updatedAt: now,
          });
        }

        console.log(
          `Generated label suggestions for thread ${threadId}: ${filteredSuggestedLabelIds.length} labels`,
        );

        return {
          threadId,
          success: true,
          data: { labelIds: filteredSuggestedLabelIds, cached: false },
        };
      } catch (error) {
        console.error(
          `Suggest-labels processor failed for thread ${threadId}:`,
          error,
        );
        return {
          threadId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
