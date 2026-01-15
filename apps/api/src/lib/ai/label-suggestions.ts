import { google } from "@ai-sdk/google";
import type { InferLiveObject } from "@live-state/sync";
import { jsonContentToPlainText, safeParseJSON } from "@workspace/utils/tiptap";
import { generateText, Output } from "ai";
import { createHash } from "node:crypto";
import z from "zod";
import type { schema } from "../../live-state/schema";

type Thread = InferLiveObject<typeof schema.thread, { messages: true }>;

type Label = InferLiveObject<typeof schema.label>;

type SuggestionMetadata = {
  hash?: string;
  dismissed?: string[];
  accepted?: string[];
};

export const generateContentHash = (
  thread: Thread,
  labels: Label[]
): string => {
  const messages = thread.messages ?? [];
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

export const generateLabelSuggestions = async (
  thread: Thread,
  labels: Label[]
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

export const filterDismissedLabels = (
  labelIds: string[],
  dismissedIds: string[]
): string[] => {
  const dismissedSet = new Set(dismissedIds);
  return labelIds.filter((id) => !dismissedSet.has(id));
};

export const getSuggestionMetadata = (
  metadataStr: string | null | undefined
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

export const createSuggestionMetadata = (
  hash: string,
  dismissed: string[] = [],
  accepted: string[] = []
): string => {
  return JSON.stringify({ hash, dismissed, accepted });
};
