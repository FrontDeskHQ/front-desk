import { ulid } from "ulid";
import z from "zod";
import {
  createSuggestionMetadata,
  filterDismissedLabels,
  generateContentHash,
  generateLabelSuggestions,
  getSuggestionMetadata,
} from "../../lib/ai/label-suggestions";
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

        const allLabels = Object.values(
          await db.find(schema.label, {
            where: {
              organizationId,
            },
          })
        );

        const enabledLabels = allLabels.filter((l) => l.enabled);
        const currentHash = generateContentHash(thread, allLabels);

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
        const existingMetadata = getSuggestionMetadata(
          existingSuggestion?.metadataStr
        );

        if (existingSuggestion && existingMetadata.hash === currentHash) {
          const results = existingSuggestion.resultsStr
            ? (JSON.parse(existingSuggestion.resultsStr) as string[])
            : [];

          const validLabelIds = new Set(enabledLabels.map((l) => l.id));
          const filteredResults = filterDismissedLabels(
            results.filter((id) => validLabelIds.has(id)),
            existingMetadata.dismissed ?? []
          );

          return { labelIds: filteredResults, cached: true };
        }

        const suggestedLabelIds = await generateLabelSuggestions(
          thread,
          allLabels
        );

        const filteredSuggestedIds = filterDismissedLabels(
          suggestedLabelIds,
          existingMetadata.dismissed ?? []
        );

        const now = new Date();
        const metadataStr = createSuggestionMetadata(
          currentHash,
          existingMetadata.dismissed ?? [],
          existingMetadata.accepted ?? []
        );

        if (existingSuggestion) {
          await db.update(schema.suggestion, existingSuggestion.id, {
            resultsStr: JSON.stringify(filteredSuggestedIds),
            metadataStr,
            updatedAt: now,
          });
        } else {
          await db.insert(schema.suggestion, {
            id: ulid().toLowerCase(),
            type: SUGGESTION_TYPE_LABEL,
            entityId: threadId,
            organizationId,
            resultsStr: JSON.stringify(filteredSuggestedIds),
            metadataStr,
            createdAt: now,
            updatedAt: now,
          });
        }

        return { labelIds: filteredSuggestedIds, cached: false };
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
