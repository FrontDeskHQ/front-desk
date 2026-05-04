import { google } from "@ai-sdk/google";
import { jsonContentToPlainText, safeParseJSON } from "@workspace/utils/tiptap";
import { canDoAutonomously, computeUrgency } from "@workspace/schemas/signals";
import { generateText, Output } from "ai";
import { createHash } from "node:crypto";
import { ulid } from "ulid";
import z from "zod";
import { getOrgAutonomy } from "../../lib/autonomy";
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

const computeSha256 = (data: string): string => {
  return createHash("sha256").update(data).digest("hex");
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

        const existingSuggestions = (await fetchClient.query.suggestion
          .where({
            type: SUGGESTION_TYPE_LABEL,
            entityId: threadId,
            organizationId,
          })
          .get()) as SuggestionRow[];

        const existingByLabelId = new Map<string, SuggestionRow>();
        for (const s of existingSuggestions) {
          if (s.relatedEntityId) {
            existingByLabelId.set(s.relatedEntityId, s);
          }
        }

        const suggestedLabelIds = await generateLabelSuggestions(
          thread,
          allLabels,
        );

        const autonomyMap = await getOrgAutonomy(organizationId);
        const autoApply = canDoAutonomously("label", autonomyMap.label);

        // Already-applied labels on this thread; we don't auto-apply duplicates.
        const existingThreadLabels = (await fetchClient.query.threadLabel
          .where({ threadId })
          .get()) as { id: string; labelId: string; enabled: boolean }[];
        const appliedLabelIds = new Set(
          existingThreadLabels
            .filter((tl) => tl.enabled)
            .map((tl) => tl.labelId),
        );

        const now = new Date();
        const filteredSuggestedLabelIds: string[] = [];

        for (const labelId of suggestedLabelIds) {
          const existing = existingByLabelId.get(labelId);

          if (autoApply && !appliedLabelIds.has(labelId)) {
            const label = allLabels.find((l) => l.id === labelId);
            const suggestionId = existing?.id ?? ulid().toLowerCase();

            await fetchClient.mutate.threadLabel.insert({
              id: ulid().toLowerCase(),
              threadId,
              labelId,
              enabled: true,
            });

            await fetchClient.mutate.update.insert({
              id: ulid().toLowerCase(),
              threadId,
              userId: null,
              type: "label_changed",
              createdAt: now,
              metadataStr: JSON.stringify({
                action: "added",
                labelId,
                labelName: label?.name ?? null,
                source: "autonomous",
                signalType: "label",
                signalId: suggestionId,
              }),
              replicatedStr: JSON.stringify({}),
            });

            await fetchClient.mutate.autonomousAction.record({
              organizationId,
              signalType: "label",
              entityId: threadId,
              metadata: { kind: "label", labelId },
            });

            if (existing) {
              await fetchClient.mutate.suggestion.update(existing.id, {
                active: false,
                accepted: true,
                actedAt: now,
                updatedAt: now,
              });
            } else {
              await fetchClient.mutate.suggestion.insert({
                id: suggestionId,
                type: SUGGESTION_TYPE_LABEL,
                entityId: threadId,
                relatedEntityId: labelId,
                organizationId,
                active: false,
                accepted: true,
                resultsStr: null,
                metadataStr: null,
                urgencyScore: computeUrgency({
                  signalType: "label",
                  ageHours: 0,
                }),
                actedAt: now,
                createdAt: now,
                updatedAt: now,
              });
            }
            continue;
          }

          if (existing) {
            await fetchClient.mutate.suggestion.update(existing.id, {
              active: existing.active,
              accepted: existing.accepted,
              updatedAt: now,
            });
          } else {
            await fetchClient.mutate.suggestion.insert({
              id: ulid().toLowerCase(),
              type: SUGGESTION_TYPE_LABEL,
              entityId: threadId,
              relatedEntityId: labelId,
              organizationId,
              active: true,
              accepted: false,
              resultsStr: null,
              metadataStr: null,
              urgencyScore: computeUrgency({
                signalType: "label",
                ageHours: 0,
              }),
              createdAt: now,
              updatedAt: now,
            });
          }

          if (!existing || existing.active) {
            filteredSuggestedLabelIds.push(labelId);
          }
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
