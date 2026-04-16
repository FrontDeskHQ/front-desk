import {
  createClient,
  defineOptimisticMutations,
} from "@live-state/sync/client";
import { createClient as createFetchClient } from "@live-state/sync/client/fetch";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import type { Router } from "api/router";
import { schema } from "api/schema";
import { ulid } from "ulid";
import { authClient } from "./auth-client";
import { getLiveStateApiUrl } from "./urls";

const { client, store } = createClient<Router>({
  url:
    import.meta.env.VITE_LIVE_STATE_WS_URL ?? "ws://localhost:3333/api/ls/ws",
  schema,
  credentials: async () => ({
    token: (await authClient.oneTimeToken.generate()).data?.token ?? "",
  }),
  storage: {
    name: "frontdesk",
  },
  connection: {
    autoConnect: false,
  },
  optimisticMutations: defineOptimisticMutations<Router, typeof schema>({
    onboarding: {
      completeStep: ({ input, storage }) => {
        const row = storage.onboarding.where({ id: input.onboardingId }).get()[0];
        if (!row) {
          return;
        }

        let steps: Record<string, { completedAt: string }> = {};
        try {
          steps = JSON.parse(row.stepsStr || "{}") as Record<
            string,
            { completedAt: string }
          >;
        } catch {
          steps = {};
        }
        steps[input.stepId] = { completedAt: new Date().toISOString() };

        storage.onboarding.update(input.onboardingId, {
          stepsStr: JSON.stringify(steps),
          updatedAt: new Date(),
        });
      },
      skip: ({ input, storage }) => {
        const row = storage.onboarding.where({ id: input.onboardingId }).get()[0];
        if (!row) {
          return;
        }

        storage.onboarding.update(input.onboardingId, {
          status: "skipped",
          updatedAt: new Date(),
        });
      },
      complete: ({ input, storage }) => {
        const row = storage.onboarding.where({ id: input.onboardingId }).get()[0];
        if (!row) {
          return;
        }

        storage.onboarding.update(input.onboardingId, {
          status: "completed",
          updatedAt: new Date(),
        });
      },
    },
    invite: {
      cancel: ({ input, storage }) => {
        const row = storage.invite.where({ id: input.id }).get()[0];
        if (!row) {
          return;
        }

        storage.invite.update(input.id, {
          active: false,
        });
      },
    },
    author: {
      create: ({ input, storage }) => {
        const organizationId = input.organizationId;

        if (input.userId) {
          const existing = storage.author
            .where({
              userId: input.userId,
              organizationId,
            })
            .get()[0];
          if (existing) {
            return;
          }
        } else if (input.metaId) {
          const existing = storage.author
            .where({
              metaId: input.metaId,
              organizationId,
            })
            .get()[0];
          if (existing) {
            return;
          }
        }

        const id = input.id ?? ulid().toLowerCase();

        storage.author.insert({
          id,
          name: input.name,
          userId: input.userId ?? null,
          metaId: input.metaId ?? null,
          organizationId,
        });
      },
      update: ({ input, storage }) => {
        const row = storage.author.where({ id: input.id }).get()[0];
        if (!row) {
          return;
        }

        storage.author.update(input.id, {
          ...(input.name !== undefined ? { name: input.name } : {}),
        });
      },
    },
    organization: {
      update: ({ input, storage }) => {
        const row = storage.organization.where({ id: input.id }).get()[0];
        if (!row) {
          return;
        }

        storage.organization.update(input.id, {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
          ...(input.socials !== undefined ? { socials: input.socials } : {}),
          ...(input.customInstructions !== undefined
            ? { customInstructions: input.customInstructions }
            : {}),
          ...(input.settings !== undefined ? { settings: input.settings } : {}),
        });
      },
    },
    user: {
      update: ({ input, storage }) => {
        const row = storage.user.where({ id: input.id }).get()[0];
        if (!row) {
          return;
        }

        storage.user.update(input.id, {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.image !== undefined ? { image: input.image } : {}),
        });
      },
    },
    organizationUser: {
      update: ({ input, storage }) => {
        const row = storage.organizationUser.where({ id: input.id }).get()[0];
        if (!row) {
          return;
        }

        storage.organizationUser.update(input.id, {
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        });
      },
    },
    thread: {
      update: ({ input, storage }) => {
        const row = storage.thread.where({ id: input.id }).get()[0];
        if (!row) {
          return;
        }

        storage.thread.update(input.id, {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.assignedUserId !== undefined
            ? { assignedUserId: input.assignedUserId }
            : {}),
          ...(input.deletedAt !== undefined ? { deletedAt: input.deletedAt } : {}),
          ...(input.discordChannelId !== undefined
            ? { discordChannelId: input.discordChannelId }
            : {}),
          ...(input.externalIssueId !== undefined
            ? { externalIssueId: input.externalIssueId }
            : {}),
          ...(input.externalPrId !== undefined
            ? { externalPrId: input.externalPrId }
            : {}),
          ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
          ...(input.externalOrigin !== undefined
            ? { externalOrigin: input.externalOrigin }
            : {}),
          ...(input.externalMetadataStr !== undefined
            ? { externalMetadataStr: input.externalMetadataStr }
            : {}),
        });
      },
    },
    message: {
      create: ({ input, storage }) => {
        const author =
          storage.author
            .where({
              userId: input.userId,
              organizationId: input.organizationId,
            })
            .get()[0] ?? null;

        let authorId = author?.id;

        if (!authorId) {
          authorId = ulid().toLowerCase();

          storage.author.insert({
            id: authorId,
            userId: input.userId,
            organizationId: input.organizationId,
            name: input.userName ?? "",
          });
        }

        storage.message.insert({
          id: ulid().toLowerCase(),
          authorId: authorId,
          content: JSON.stringify(input.content),
          threadId: input.threadId,
          createdAt: new Date(),
        });
      },
      answer: ({ input, storage }) => {
        const message = storage.message.where({ id: input.messageId }).get()[0];
        if (!message) return;

        const existingAnswers = storage.message
          .where({
            threadId: message.threadId,
            markedAsAnswer: true,
          })
          .get();

        const hasOtherAnswer = existingAnswers.some(
          (existingMessage) => existingMessage.id !== input.messageId,
        );
        if (hasOtherAnswer) return;

        if (message.markedAsAnswer) return;

        storage.message.update(input.messageId, {
          markedAsAnswer: true,
        });

        const thread = storage.thread.where({ id: message.threadId }).get()[0];
        if (!thread) return;

        storage.thread.update(thread.id, {
          status: 2,
        });
      },
    },
  }),
});

const { query, mutate } = store;

export { client, mutate, query };

// Check this setup when it's deployed
export const fetchClient = createFetchClient<Router>({
  url: getLiveStateApiUrl(),
  schema,
  credentials: createIsomorphicFn()
    .server(() => Object.fromEntries(getRequestHeaders()))
    .client(() => ({})),
});
