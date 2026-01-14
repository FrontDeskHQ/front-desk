import { google } from "@ai-sdk/google";
import { jsonContentToPlainText, safeParseJSON } from "@workspace/utils/tiptap";
import { generateText, Output } from "ai";
import { ulid } from "ulid";
import z from "zod";
import { publicRoute } from "../factories";
import { schema } from "../schema";

const SUGGESTION_TYPE_LABEL = "label";

export default {
  label: publicRoute
    .collectionRoute(schema.label, {
      read: () => true,
      insert: ({ ctx }) => {
        if (ctx?.internalApiKey) return true;
        if (!ctx?.session) return false;

        return {
          organization: {
            organizationUsers: {
              userId: ctx.session.userId,
              enabled: true,
            },
          },
        };
      },
      update: {
        preMutation: ({ ctx }) => {
          if (ctx?.internalApiKey) return true;
          if (!ctx?.session) return false;

          return {
            organization: {
              organizationUsers: {
                userId: ctx.session.userId,
                enabled: true,
              },
            },
          };
        },
        postMutation: ({ ctx }) => {
          if (ctx?.internalApiKey) return true;
          if (!ctx?.session) return false;

          return {
            organization: {
              organizationUsers: {
                userId: ctx.session.userId,
                enabled: true,
              },
            },
          };
        },
      },
    })
    .withMutations(({ mutation }) => ({
      suggestLabels: mutation(
        z.object({
          threadId: z.string(),
        })
      ).handler(async ({ req, db }) => {
        if (!req.context?.session) {
          throw new Error("UNAUTHORIZED");
        }

        const userId = req.context.session.userId;
        const threadId = req.input.threadId;

        const threads = Object.values(
          await db.find(schema.thread, {
            where: { id: threadId },
            include: {
              messages: true,
              organization: true,
            },
          })
        );

        const thread = threads[0];

        if (!thread) {
          throw new Error("THREAD_NOT_FOUND");
        }

        const organizationId = thread.organizationId;

        const orgUsers = Object.values(
          await db.find(schema.organizationUser, {
            where: {
              organizationId,
              userId,
              enabled: true,
            },
          })
        );

        if (orgUsers.length === 0) {
          throw new Error("UNAUTHORIZED");
        }

        const existingSuggestions = Object.values(
          await db.find(schema.suggestion, {
            where: {
              type: SUGGESTION_TYPE_LABEL,
              entityId: threadId,
              organizationId,
            },
          })
        );

        const existingSuggestion = existingSuggestions[0];

        const messages = thread.messages ?? [];
        const latestMessageTime =
          messages.length > 0
            ? Math.max(...messages.map((m) => new Date(m.createdAt).getTime()))
            : null;
        const threadCreatedTime = new Date(thread.createdAt).getTime();
        const latestContentTime = latestMessageTime ?? threadCreatedTime;

        const allLabels = Object.values(
          await db.find(schema.label, {
            where: {
              organizationId,
            },
          })
        );

        const enabledLabels = allLabels.filter((l) => l.enabled);

        const latestLabelChangeTime =
          allLabels.length > 0
            ? Math.max(
                ...allLabels.flatMap((l) => [
                  new Date(l.updatedAt).getTime(),
                  new Date(l.createdAt).getTime(),
                ])
              )
            : 0;

        const latestChangeTime = Math.max(
          latestContentTime,
          latestLabelChangeTime
        );

        if (existingSuggestion) {
          const suggestionUpdatedTime = new Date(
            existingSuggestion.updatedAt
          ).getTime();

          if (suggestionUpdatedTime >= latestChangeTime) {
            const results = existingSuggestion.resultsStr
              ? (JSON.parse(existingSuggestion.resultsStr) as string[])
              : [];

            const metadata = existingSuggestion.metadataStr
              ? (JSON.parse(existingSuggestion.metadataStr) as {
                  dismissed?: string[];
                  accepted?: string[];
                })
              : {};
            const dismissedLabelIds = new Set(metadata.dismissed ?? []);

            const validLabelIds = new Set(enabledLabels.map((l) => l.id));
            const filteredResults = results.filter(
              (id) => validLabelIds.has(id) && !dismissedLabelIds.has(id)
            );

            return { labelIds: filteredResults, cached: true };
          }
        }

        if (enabledLabels.length === 0) {
          const now = new Date();

          if (existingSuggestion) {
            await db.update(schema.suggestion, existingSuggestion.id, {
              resultsStr: JSON.stringify([]),
              updatedAt: now,
            });
          } else {
            await db.insert(schema.suggestion, {
              id: ulid().toLowerCase(),
              type: SUGGESTION_TYPE_LABEL,
              entityId: threadId,
              organizationId,
              resultsStr: JSON.stringify([]),
              metadataStr: null,
              createdAt: now,
              updatedAt: now,
            });
          }

          return { labelIds: [], cached: false };
        }

        const threadTitle = thread.name;
        const messageContents = messages
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((m) => jsonContentToPlainText(safeParseJSON(m.content)))
          .filter((text) => text.trim().length > 0);

        const threadContent = [
          `Thread: ${threadTitle}`,
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
                .describe(
                  "Array of label IDs that are relevant to this thread"
                ),
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
        const suggestedLabelIds = aiResult.labelIds.filter((id) =>
          validLabelIds.has(id)
        );

        const existingMetadata = existingSuggestion?.metadataStr
          ? (JSON.parse(existingSuggestion.metadataStr) as {
              dismissed?: string[];
              accepted?: string[];
            })
          : {};
        const dismissedLabelIds = new Set(existingMetadata.dismissed ?? []);

        const filteredSuggestedIds = suggestedLabelIds.filter(
          (id) => !dismissedLabelIds.has(id)
        );

        const now = new Date();

        if (existingSuggestion) {
          await db.update(schema.suggestion, existingSuggestion.id, {
            resultsStr: JSON.stringify(filteredSuggestedIds),
            metadataStr: existingSuggestion.metadataStr,
            updatedAt: now,
          });
        } else {
          await db.insert(schema.suggestion, {
            id: ulid().toLowerCase(),
            type: SUGGESTION_TYPE_LABEL,
            entityId: threadId,
            organizationId,
            resultsStr: JSON.stringify(filteredSuggestedIds),
            metadataStr: JSON.stringify({ dismissed: [], accepted: [] }),
            createdAt: now,
            updatedAt: now,
          });
        }

        return { labelIds: filteredSuggestedIds, cached: false };
      }),
      updateSuggestionMetadata: mutation(
        z.object({
          threadId: z.string(),
          dismissedLabelIds: z.array(z.string()).optional(),
          acceptedLabelIds: z.array(z.string()).optional(),
        })
      ).handler(async ({ req, db }) => {
        if (!req.context?.session) {
          throw new Error("UNAUTHORIZED");
        }

        const userId = req.context.session.userId;
        const threadId = req.input.threadId;

        const threads = Object.values(
          await db.find(schema.thread, {
            where: { id: threadId },
          })
        );

        const thread = threads[0];

        if (!thread) {
          throw new Error("THREAD_NOT_FOUND");
        }

        const organizationId = thread.organizationId;

        const orgUsers = Object.values(
          await db.find(schema.organizationUser, {
            where: {
              organizationId,
              userId,
              enabled: true,
            },
          })
        );

        if (orgUsers.length === 0) {
          throw new Error("UNAUTHORIZED");
        }

        const existingSuggestions = Object.values(
          await db.find(schema.suggestion, {
            where: {
              type: SUGGESTION_TYPE_LABEL,
              entityId: threadId,
              organizationId,
            },
          })
        );

        const existingSuggestion = existingSuggestions[0];

        const metadata = existingSuggestion?.metadataStr
          ? (JSON.parse(existingSuggestion.metadataStr) as {
              dismissed?: string[];
              accepted?: string[];
            })
          : { dismissed: [], accepted: [] };

        if (req.input.dismissedLabelIds) {
          const dismissedSet = new Set([
            ...(metadata.dismissed ?? []),
            ...req.input.dismissedLabelIds,
          ]);
          metadata.dismissed = Array.from(dismissedSet);
        }

        if (req.input.acceptedLabelIds) {
          const acceptedSet = new Set([
            ...(metadata.accepted ?? []),
            ...req.input.acceptedLabelIds,
          ]);
          metadata.accepted = Array.from(acceptedSet);
        }

        const now = new Date();

        if (existingSuggestion) {
          await db.update(schema.suggestion, existingSuggestion.id, {
            metadataStr: JSON.stringify(metadata),
            updatedAt: now,
          });
        } else {
          await db.insert(schema.suggestion, {
            id: ulid().toLowerCase(),
            type: SUGGESTION_TYPE_LABEL,
            entityId: threadId,
            organizationId,
            resultsStr: JSON.stringify([]),
            metadataStr: JSON.stringify(metadata),
            createdAt: now,
            updatedAt: now,
          });
        }

        return { success: true };
      }),
    })),
  threadLabel: publicRoute.collectionRoute(schema.threadLabel, {
    read: () => true,
    insert: ({ ctx }) => {
      if (ctx?.internalApiKey) return true;
      if (!ctx?.session) return false;

      return {
        thread: {
          organization: {
            organizationUsers: {
              userId: ctx.session.userId,
              enabled: true,
            },
          },
        },
      };
    },
    update: {
      preMutation: ({ ctx }) => {
        if (ctx?.internalApiKey) return true;
        if (!ctx?.session) return false;

        return {
          thread: {
            organization: {
              organizationUsers: {
                userId: ctx.session.userId,
                enabled: true,
              },
            },
          },
        };
      },
      postMutation: ({ ctx }) => {
        if (ctx?.internalApiKey) return true;
        if (!ctx?.session) return false;

        return {
          thread: {
            organization: {
              organizationUsers: {
                userId: ctx.session.userId,
                enabled: true,
              },
            },
          },
        };
      },
    },
  }),
};
