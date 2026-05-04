import {
  createClient,
  defineOptimisticMutations,
} from "@live-state/sync/client";
import { createClient as createFetchClient } from "@live-state/sync/client/fetch";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import {
  parseAutonomousActionMetadata,
  STATUS_LABELS,
} from "@workspace/schemas/signals";
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
      markAsAnswer: ({ input, storage }) => {
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
    label: {
      create: ({ input, storage }) => {
        const now = new Date();

        storage.label.insert({
          id: input.id ?? ulid().toLowerCase(),
          organizationId: input.organizationId,
          name: input.name,
          color: input.color,
          enabled: input.enabled ?? true,
          createdAt: now,
          updatedAt: now,
        });
      },
      update: ({ input, storage }) => {
        storage.label.update(input.labelId, {
          name: input.name,
          color: input.color,
          enabled: input.enabled,
          updatedAt: input.updatedAt ?? new Date(),
        });
      },
      createAndAttachToThread: ({ input, storage }) => {
        const labelId = input.labelId ?? ulid().toLowerCase();
        const threadLabelId = input.threadLabelId ?? ulid().toLowerCase();
        const now = new Date();

        storage.label.insert({
          id: labelId,
          organizationId: input.organizationId,
          name: input.name,
          color: input.color,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        });

        storage.threadLabel.insert({
          id: threadLabelId,
          threadId: input.threadId,
          labelId,
          enabled: true,
        });
      },
      attachToThread: ({ input, storage }) => {
        const existing =
          storage.threadLabel
            .where({
              threadId: input.threadId,
              labelId: input.labelId,
            })
            .get()[0] ?? null;

        if (existing) {
          if (!existing.enabled) {
            storage.threadLabel.update(existing.id, { enabled: true });
          }
          return;
        }

        storage.threadLabel.insert({
          id: input.id ?? ulid().toLowerCase(),
          threadId: input.threadId,
          labelId: input.labelId,
          enabled: true,
        });
      },
      detachFromThread: ({ input, storage }) => {
        storage.threadLabel.update(input.threadLabelId, {
          enabled: false,
        });
      },
    },
    autonomousAction: {
      undo: ({ input, storage }) => {
        const row = storage.autonomousAction
          .where({ id: input.id, organizationId: input.organizationId })
          .get()[0];
        if (!row || row.undoneAt) return;

        const metadata = parseAutonomousActionMetadata(row.metadataStr);
        const threadId = row.entityId;
        const now = new Date();

        let activityType: string | null = null;
        let activityMetadata: Record<string, unknown> = {
          source: "autonomous_undo",
        };

        if (metadata?.kind === "label") {
          const tl = storage.threadLabel
            .where({ threadId, labelId: metadata.labelId })
            .get()[0];
          if (tl?.enabled) {
            storage.threadLabel.update(tl.id, { enabled: false });
          }
          const label = storage.label
            .where({ id: metadata.labelId })
            .get()[0];
          activityType = "label_changed";
          activityMetadata = {
            action: "removed",
            labelId: metadata.labelId,
            labelName: label?.name ?? null,
            source: "autonomous_undo",
          };
        } else if (metadata?.kind === "linked_pr") {
          const thread = storage.thread.where({ id: threadId }).get()[0];
          const oldPrId = thread?.externalPrId ?? null;
          storage.thread.update(threadId, { externalPrId: null });
          activityType = "pr_changed";
          activityMetadata = {
            oldPrId,
            newPrId: null,
            oldPrLabel: oldPrId ? "linked PR" : null,
            newPrLabel: null,
            source: "autonomous_undo",
          };
        } else if (metadata?.kind === "duplicate") {
          storage.thread.update(threadId, { status: metadata.previousStatus });
          activityType = "marked_duplicate";
          activityMetadata = {
            duplicateOfThreadId: metadata.relatedThreadId,
            source: "autonomous_undo",
          };
        } else if (metadata?.kind === "status") {
          storage.thread.update(threadId, { status: metadata.previousStatus });
          activityType = "status_changed";
          activityMetadata = {
            newStatus: metadata.previousStatus,
            newStatusLabel: STATUS_LABELS[metadata.previousStatus] ?? null,
            source: "autonomous_undo",
          };
        }

        if (activityType) {
          storage.update.insert({
            id: ulid().toLowerCase(),
            threadId,
            userId: null,
            type: activityType,
            createdAt: now,
            metadataStr: JSON.stringify(activityMetadata),
            replicatedStr: JSON.stringify({}),
          });
        }

        storage.autonomousAction.update(row.id, { undoneAt: now });
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
