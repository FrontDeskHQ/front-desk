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

type ExternalEntityKind = "issue" | "pull_request";

type OptimisticExternalEntityStorage = {
  thread: {
    where: (query: { id: string }) => {
      get: () => Array<{
        externalIssueId?: string | null;
        externalPrId?: string | null;
      }>;
    };
    update: (
      id: string,
      data: { externalIssueId?: string | null; externalPrId?: string | null },
    ) => void;
  };
  externalEntity: {
    where: (query: {
      organizationId: string;
      externalKey: string;
      type: ExternalEntityKind;
    }) => {
      get: () => Array<{ repoFullName: string; number: number }>;
    };
  };
  update: {
    insert: (data: {
      id: string;
      threadId: string;
      userId: string;
      type: string;
      createdAt: Date;
      metadataStr: string;
      replicatedStr: string;
    }) => void;
  };
};

const optimisticExternalEntityConfig = {
  issue: {
    threadField: "externalIssueId" as const,
    updateType: "issue_changed" as const,
    entityType: "issue" as const,
    metadataKeys: {
      oldId: "oldIssueId",
      newId: "newIssueId",
      oldLabel: "oldIssueLabel",
      newLabel: "newIssueLabel",
    },
  },
  pull_request: {
    threadField: "externalPrId" as const,
    updateType: "pr_changed" as const,
    entityType: "pull_request" as const,
    metadataKeys: {
      oldId: "oldPrId",
      newId: "newPrId",
      oldLabel: "oldPrLabel",
      newLabel: "newPrLabel",
    },
  },
} satisfies Record<
  ExternalEntityKind,
  {
    threadField: "externalIssueId" | "externalPrId";
    updateType: "issue_changed" | "pr_changed";
    entityType: ExternalEntityKind;
    metadataKeys: {
      oldId: string;
      newId: string;
      oldLabel: string;
      newLabel: string;
    };
  }
>;

const resolveOptimisticExternalEntityLabel = (
  storage: OptimisticExternalEntityStorage,
  organizationId: string,
  externalKey: string | null,
  type: ExternalEntityKind,
) => {
  if (!externalKey) return null;

  const entity = storage.externalEntity
    .where({ organizationId, externalKey, type })
    .get()[0];

  return entity ? `${entity.repoFullName}#${entity.number}` : null;
};

const handleOptimisticLinkExternalEntity = ({
  input,
  storage,
  kind,
  externalId,
}: {
  input: {
    threadId: string;
    organizationId: string;
    userId?: string;
    userName?: string;
  };
  storage: OptimisticExternalEntityStorage;
  kind: ExternalEntityKind;
  externalId: string;
}) => {
  const config = optimisticExternalEntityConfig[kind];
  const thread = storage.thread.where({ id: input.threadId }).get()[0];
  if (!thread) return;

  const oldId = thread[config.threadField] ?? null;
  if (oldId === externalId) return;

  storage.thread.update(input.threadId, {
    [config.threadField]: externalId,
  });

  if (!input.userId) return;

  storage.update.insert({
    id: ulid().toLowerCase(),
    threadId: input.threadId,
    userId: input.userId,
    type: config.updateType,
    createdAt: new Date(),
    metadataStr: JSON.stringify({
      [config.metadataKeys.oldId]: oldId,
      [config.metadataKeys.newId]: externalId,
      [config.metadataKeys.oldLabel]: resolveOptimisticExternalEntityLabel(
        storage,
        input.organizationId,
        oldId,
        config.entityType,
      ),
      [config.metadataKeys.newLabel]: resolveOptimisticExternalEntityLabel(
        storage,
        input.organizationId,
        externalId,
        config.entityType,
      ),
      ...(input.userName ? { userName: input.userName } : {}),
    }),
    replicatedStr: JSON.stringify({}),
  });
};

const handleOptimisticUnlinkExternalEntity = ({
  input,
  storage,
  kind,
}: {
  input: {
    threadId: string;
    organizationId: string;
    userId?: string;
    userName?: string;
  };
  storage: OptimisticExternalEntityStorage;
  kind: ExternalEntityKind;
}) => {
  const config = optimisticExternalEntityConfig[kind];
  const thread = storage.thread.where({ id: input.threadId }).get()[0];
  if (!thread) return;

  const oldId = thread[config.threadField] ?? null;
  if (oldId === null) return;

  const oldLabel = resolveOptimisticExternalEntityLabel(
    storage,
    input.organizationId,
    oldId,
    config.entityType,
  );

  storage.thread.update(input.threadId, { [config.threadField]: null });

  if (!input.userId) return;

  storage.update.insert({
    id: ulid().toLowerCase(),
    threadId: input.threadId,
    userId: input.userId,
    type: config.updateType,
    createdAt: new Date(),
    metadataStr: JSON.stringify({
      [config.metadataKeys.oldId]: oldId,
      [config.metadataKeys.newId]: null,
      [config.metadataKeys.oldLabel]: oldLabel,
      [config.metadataKeys.newLabel]: null,
      ...(input.userName ? { userName: input.userName } : {}),
    }),
    replicatedStr: JSON.stringify({}),
  });
};

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
        handleOptimisticLinkExternalEntity({
          input,
          storage,
          kind: "issue",
          externalId: input.externalIssueId,
        });
      },
      unlinkIssue: ({ input, storage }) => {
        handleOptimisticUnlinkExternalEntity({
          input,
          storage,
          kind: "issue",
        });
      },
      linkPullRequest: ({ input, storage }) => {
        handleOptimisticLinkExternalEntity({
          input,
          storage,
          kind: "pull_request",
          externalId: input.externalPrId,
        });
      },
      unlinkPullRequest: ({ input, storage }) => {
        handleOptimisticUnlinkExternalEntity({
          input,
          storage,
          kind: "pull_request",
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
