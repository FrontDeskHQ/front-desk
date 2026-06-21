import {
  createClient,
  defineOptimisticMutations,
} from "@live-state/sync/client";
import { createClient as createFetchClient } from "@live-state/sync/client/fetch";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import {
  parseAutonomousActionMetadata,
  PRIORITY_LABELS,
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
    thread: {
      acceptRead: ({ input, storage }) => {
        storage.thread.update(input.threadId, { agentRead: null });
      },
      dismissRead: ({ input, storage }) => {
        storage.thread.update(input.threadId, { agentRead: null });
      },
      acceptInlineSuggestion: ({ input, storage }) => {
        const thread = storage.thread.where({ id: input.threadId }).get()[0];
        if (!thread) return;
        const suggestions = thread.inlineSuggestions ?? [];
        storage.thread.update(input.threadId, {
          inlineSuggestions: suggestions.filter(
            (suggestion) => suggestion.id !== input.suggestionId,
          ),
        });
      },
      dismissInlineSuggestion: ({ input, storage }) => {
        const thread = storage.thread.where({ id: input.threadId }).get()[0];
        if (!thread) return;
        const suggestions = thread.inlineSuggestions ?? [];
        storage.thread.update(input.threadId, {
          inlineSuggestions: suggestions.filter(
            (suggestion) => suggestion.id !== input.suggestionId,
          ),
        });
      },
      setStatus: ({ input, storage }) => {
        const thread = storage.thread.where({ id: input.threadId }).get()[0];
        if (!thread) return;

        const oldStatus = thread.status ?? 0;
        if (oldStatus === input.status) return;

        storage.thread.update(input.threadId, { status: input.status });

        if (!input.userId) return;

        storage.update.insert({
          id: ulid().toLowerCase(),
          threadId: input.threadId,
          userId: input.userId,
          type: "status_changed",
          createdAt: new Date(),
          metadataStr: JSON.stringify({
            oldStatus,
            newStatus: input.status,
            oldStatusLabel: STATUS_LABELS[oldStatus] ?? null,
            newStatusLabel: STATUS_LABELS[input.status] ?? null,
            ...(input.userName ? { userName: input.userName } : {}),
            ...(input.source ? { source: input.source } : {}),
          }),
          replicatedStr: JSON.stringify({}),
        });
      },
      setPriority: ({ input, storage }) => {
        const thread = storage.thread.where({ id: input.threadId }).get()[0];
        if (!thread) return;

        const oldPriority = thread.priority ?? 0;
        if (oldPriority === input.priority) return;

        storage.thread.update(input.threadId, { priority: input.priority });

        if (!input.userId) return;

        storage.update.insert({
          id: ulid().toLowerCase(),
          threadId: input.threadId,
          userId: input.userId,
          type: "priority_changed",
          createdAt: new Date(),
          metadataStr: JSON.stringify({
            oldPriority,
            newPriority: input.priority,
            oldPriorityLabel: PRIORITY_LABELS[oldPriority] ?? null,
            newPriorityLabel: PRIORITY_LABELS[input.priority] ?? null,
            ...(input.userName ? { userName: input.userName } : {}),
          }),
          replicatedStr: JSON.stringify({}),
        });
      },
      assignUser: ({ input, storage }) => {
        const thread = storage.thread.where({ id: input.threadId }).get()[0];
        if (!thread) return;

        const oldAssignedUserId = thread.assignedUserId ?? null;
        const newAssignedUserId = input.assignedUserId;
        if (oldAssignedUserId === newAssignedUserId) return;

        storage.thread.update(input.threadId, {
          assignedUserId: newAssignedUserId,
        });

        if (!input.userId) return;

        const oldAssignedUserName =
          storage.user.where({ id: oldAssignedUserId ?? "" }).get()[0]?.name ??
          null;
        const newAssignedUserName =
          storage.user.where({ id: newAssignedUserId ?? "" }).get()[0]?.name ??
          null;

        storage.update.insert({
          id: ulid().toLowerCase(),
          threadId: input.threadId,
          userId: input.userId,
          type: "assigned_changed",
          createdAt: new Date(),
          metadataStr: JSON.stringify({
            oldAssignedUserId,
            newAssignedUserId,
            oldAssignedUserName:
              oldAssignedUserName ??
              (oldAssignedUserId ? "Unknown user" : null),
            newAssignedUserName:
              newAssignedUserName ??
              (newAssignedUserId ? "Unknown user" : null),
            ...(input.userName ? { userName: input.userName } : {}),
          }),
          replicatedStr: JSON.stringify({}),
        });
      },
      linkIssue: ({ input, storage }) => {
        const thread = storage.thread.where({ id: input.threadId }).get()[0];
        if (!thread) return;

        const oldIssueId = thread.externalIssueId ?? null;
        if (oldIssueId === input.externalIssueId) return;

        const resolveIssueLabel = (externalKey: string | null) => {
          if (!externalKey) return null;
          const entity = storage.externalEntity
            .where({
              organizationId: input.organizationId,
              externalKey,
              type: "issue",
            })
            .get()[0];
          return entity ? `${entity.repoFullName}#${entity.number}` : null;
        };

        storage.thread.update(input.threadId, {
          externalIssueId: input.externalIssueId,
        });

        if (!input.userId) return;

        storage.update.insert({
          id: ulid().toLowerCase(),
          threadId: input.threadId,
          userId: input.userId,
          type: "issue_changed",
          createdAt: new Date(),
          metadataStr: JSON.stringify({
            oldIssueId,
            newIssueId: input.externalIssueId,
            oldIssueLabel: resolveIssueLabel(oldIssueId),
            newIssueLabel: resolveIssueLabel(input.externalIssueId),
            ...(input.userName ? { userName: input.userName } : {}),
          }),
          replicatedStr: JSON.stringify({}),
        });
      },
      unlinkIssue: ({ input, storage }) => {
        const thread = storage.thread.where({ id: input.threadId }).get()[0];
        if (!thread) return;

        const oldIssueId = thread.externalIssueId ?? null;
        if (oldIssueId === null) return;

        const oldIssue = storage.externalEntity
          .where({
            organizationId: input.organizationId,
            externalKey: oldIssueId,
            type: "issue",
          })
          .get()[0];
        const oldIssueLabel = oldIssue
          ? `${oldIssue.repoFullName}#${oldIssue.number}`
          : null;

        storage.thread.update(input.threadId, { externalIssueId: null });

        if (!input.userId) return;

        storage.update.insert({
          id: ulid().toLowerCase(),
          threadId: input.threadId,
          userId: input.userId,
          type: "issue_changed",
          createdAt: new Date(),
          metadataStr: JSON.stringify({
            oldIssueId,
            newIssueId: null,
            oldIssueLabel,
            newIssueLabel: null,
            ...(input.userName ? { userName: input.userName } : {}),
          }),
          replicatedStr: JSON.stringify({}),
        });
      },
      linkPullRequest: ({ input, storage }) => {
        const thread = storage.thread.where({ id: input.threadId }).get()[0];
        if (!thread) return;

        const oldPrId = thread.externalPrId ?? null;
        if (oldPrId === input.externalPrId) return;

        const resolvePrLabel = (externalKey: string | null) => {
          if (!externalKey) return null;
          const entity = storage.externalEntity
            .where({
              organizationId: input.organizationId,
              externalKey,
              type: "pull_request",
            })
            .get()[0];
          return entity ? `${entity.repoFullName}#${entity.number}` : null;
        };

        storage.thread.update(input.threadId, {
          externalPrId: input.externalPrId,
        });

        if (!input.userId) return;

        storage.update.insert({
          id: ulid().toLowerCase(),
          threadId: input.threadId,
          userId: input.userId,
          type: "pr_changed",
          createdAt: new Date(),
          metadataStr: JSON.stringify({
            oldPrId,
            newPrId: input.externalPrId,
            oldPrLabel: resolvePrLabel(oldPrId),
            newPrLabel: resolvePrLabel(input.externalPrId),
            ...(input.userName ? { userName: input.userName } : {}),
          }),
          replicatedStr: JSON.stringify({}),
        });
      },
      unlinkPullRequest: ({ input, storage }) => {
        const thread = storage.thread.where({ id: input.threadId }).get()[0];
        if (!thread) return;

        const oldPrId = thread.externalPrId ?? null;
        if (oldPrId === null) return;

        const oldPr = storage.externalEntity
          .where({
            organizationId: input.organizationId,
            externalKey: oldPrId,
            type: "pull_request",
          })
          .get()[0];
        const oldPrLabel = oldPr
          ? `${oldPr.repoFullName}#${oldPr.number}`
          : null;

        storage.thread.update(input.threadId, { externalPrId: null });

        if (!input.userId) return;

        storage.update.insert({
          id: ulid().toLowerCase(),
          threadId: input.threadId,
          userId: input.userId,
          type: "pr_changed",
          createdAt: new Date(),
          metadataStr: JSON.stringify({
            oldPrId,
            newPrId: null,
            oldPrLabel,
            newPrLabel: null,
            ...(input.userName ? { userName: input.userName } : {}),
          }),
          replicatedStr: JSON.stringify({}),
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
        if (!metadata) return;
        const threadId = row.entityId;
        const now = new Date();

        let activityType: string | null = null;
        let activityMetadata: Record<string, unknown> = {
          source: "autonomous_undo",
        };

        if (metadata?.kind === "apply_label") {
          const tl = storage.threadLabel
            .where({ threadId, labelId: metadata.labelId })
            .get()[0];
          if (tl?.enabled) {
            storage.threadLabel.update(tl.id, { enabled: false });
          }
          const label = storage.label.where({ id: metadata.labelId }).get()[0];
          activityType = "label_changed";
          activityMetadata = {
            action: "removed",
            labelId: metadata.labelId,
            labelName: label?.name ?? null,
            source: "autonomous_undo",
          };
        } else if (metadata?.kind === "link_pr") {
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
        } else if (metadata?.kind === "mark_duplicate") {
          storage.thread.update(threadId, { status: metadata.previousStatus });
          activityType = "marked_duplicate";
          activityMetadata = {
            duplicateOfThreadId: metadata.relatedThreadId,
            source: "autonomous_undo",
          };
        } else if (metadata?.kind === "set_status") {
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
