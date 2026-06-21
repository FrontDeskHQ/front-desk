import type { InferLiveObject } from "@live-state/sync";
import type { ServerDB } from "@live-state/sync/server";
import { PRIORITY_LABELS } from "@workspace/schemas/signals";
import { ulid } from "ulid";
import { z } from "zod";
import { schema } from "../live-state/schema";
import { statusActivityMetadata } from "./signals/activity";

export const setStatusInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  status: z.number().int().min(0).max(4),
  source: z.string().optional(),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

export const setPriorityInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  priority: z.number().int().min(0).max(4),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

export const assignUserInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  assignedUserId: z.string().nullable(),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

export const linkIssueInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  externalIssueId: z.string(),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

export const unlinkIssueInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

type ThreadWriteDb = Pick<ServerDB<typeof schema>, "thread" | "insert">;

type ThreadAssignDb = ThreadWriteDb &
  Pick<ServerDB<typeof schema>, "organizationUser">;

type ThreadIssueLinkDb = ThreadWriteDb &
  Pick<ServerDB<typeof schema>, "find">;

const priorityActivityMetadata = (oldPriority: number, newPriority: number) => ({
  oldPriority,
  newPriority,
  oldPriorityLabel: PRIORITY_LABELS[oldPriority] ?? null,
  newPriorityLabel: PRIORITY_LABELS[newPriority] ?? null,
});

const resolveAssignedUserName = async (
  db: Pick<ServerDB<typeof schema>, "organizationUser">,
  organizationId: string,
  userId: string | null,
) => {
  if (!userId) return null;

  const orgUser = await db.organizationUser
    .first({ organizationId, userId, enabled: true })
    .include({ user: true })
    .get();

  return orgUser?.user?.name ?? null;
};

type ThreadRow = InferLiveObject<typeof schema.thread>;

export const runSetThreadStatus = async (
  db: ThreadWriteDb,
  input: z.infer<typeof setStatusInputSchema>,
  actor: {
    userId: string | null;
    userName: string | null;
  },
  options?: {
    preloadedThread?: ThreadRow;
  },
) => {
  const thread =
    options?.preloadedThread ??
    (await db.thread.one(input.threadId).get());
  if (!thread || thread.organizationId !== input.organizationId) {
    throw new Error("THREAD_NOT_FOUND");
  }

  const oldStatus = thread.status ?? 0;
  if (oldStatus === input.status) {
    return { thread, unchanged: true as const };
  }

  await db.thread.update(input.threadId, { status: input.status });

  if (actor.userId !== null) {
    await db.insert(schema.update, {
      id: ulid().toLowerCase(),
      threadId: input.threadId,
      userId: actor.userId,
      type: "status_changed",
      createdAt: new Date(),
      metadataStr: JSON.stringify({
        ...statusActivityMetadata(oldStatus, input.status),
        ...(actor.userName ? { userName: actor.userName } : {}),
        ...(input.source ? { source: input.source } : {}),
      }),
      replicatedStr: JSON.stringify({}),
    });
  }

  return {
    thread: { ...thread, status: input.status },
    oldStatus,
    newStatus: input.status,
  };
};

export const runSetThreadPriority = async (
  db: ThreadWriteDb,
  input: z.infer<typeof setPriorityInputSchema>,
  actor: {
    userId: string | null;
    userName: string | null;
  },
) => {
  const thread = await db.thread.one(input.threadId).get();
  if (!thread || thread.organizationId !== input.organizationId) {
    throw new Error("THREAD_NOT_FOUND");
  }

  const oldPriority = thread.priority ?? 0;
  if (oldPriority === input.priority) {
    return { thread, unchanged: true as const };
  }

  await db.thread.update(input.threadId, { priority: input.priority });

  if (actor.userId !== null) {
    await db.insert(schema.update, {
      id: ulid().toLowerCase(),
      threadId: input.threadId,
      userId: actor.userId,
      type: "priority_changed",
      createdAt: new Date(),
      metadataStr: JSON.stringify({
        ...priorityActivityMetadata(oldPriority, input.priority),
        ...(actor.userName ? { userName: actor.userName } : {}),
      }),
      replicatedStr: JSON.stringify({}),
    });
  }

  const updated = await db.thread.one(input.threadId).get();
  return { thread: updated, oldPriority, newPriority: input.priority };
};

export const runAssignThreadUser = async (
  db: ThreadAssignDb,
  input: z.infer<typeof assignUserInputSchema>,
  actor: {
    userId: string | null;
    userName: string | null;
  },
) => {
  const thread = await db.thread.one(input.threadId).get();
  if (!thread || thread.organizationId !== input.organizationId) {
    throw new Error("THREAD_NOT_FOUND");
  }

  const oldAssignedUserId = thread.assignedUserId ?? null;
  const newAssignedUserId = input.assignedUserId;
  if (oldAssignedUserId === newAssignedUserId) {
    return { thread, unchanged: true as const };
  }

  if (newAssignedUserId !== null) {
    const assignee = await db.organizationUser
      .first({
        organizationId: input.organizationId,
        userId: newAssignedUserId,
        enabled: true,
      })
      .get();
    if (!assignee) {
      throw new Error("ASSIGNEE_NOT_IN_ORGANIZATION");
    }
  }

  const [oldAssignedUserName, newAssignedUserName] = await Promise.all([
    resolveAssignedUserName(db, input.organizationId, oldAssignedUserId),
    resolveAssignedUserName(db, input.organizationId, newAssignedUserId),
  ]);

  await db.thread.update(input.threadId, {
    assignedUserId: newAssignedUserId,
  });

  if (actor.userId !== null) {
    await db.insert(schema.update, {
      id: ulid().toLowerCase(),
      threadId: input.threadId,
      userId: actor.userId,
      type: "assigned_changed",
      createdAt: new Date(),
      metadataStr: JSON.stringify({
        oldAssignedUserId,
        newAssignedUserId,
        oldAssignedUserName,
        newAssignedUserName,
        ...(actor.userName ? { userName: actor.userName } : {}),
      }),
      replicatedStr: JSON.stringify({}),
    });
  }

  const updated = await db.thread
    .one(input.threadId)
    .include({ assignedUser: true })
    .get();
  return {
    thread: updated,
    oldAssignedUserId,
    newAssignedUserId,
  };
};

const resolveIssueLabel = async (
  db: Pick<ServerDB<typeof schema>, "find">,
  organizationId: string,
  externalKey: string | null,
) => {
  if (!externalKey) return null;

  const entity = Object.values(
    await db.find(schema.externalEntity, {
      where: { organizationId, externalKey, type: "issue" },
    }),
  )[0];

  if (!entity) return null;
  return `${entity.repoFullName}#${entity.number}`;
};

export const runLinkIssue = async (
  db: ThreadIssueLinkDb,
  input: z.infer<typeof linkIssueInputSchema>,
  actor: {
    userId: string | null;
    userName: string | null;
  },
) => {
  const thread = await db.thread.one(input.threadId).get();
  if (!thread || thread.organizationId !== input.organizationId) {
    throw new Error("THREAD_NOT_FOUND");
  }

  const oldIssueId = thread.externalIssueId ?? null;
  if (oldIssueId === input.externalIssueId) {
    return { thread, unchanged: true as const };
  }

  const [oldIssueLabel, newIssueLabel] = await Promise.all([
    resolveIssueLabel(db, input.organizationId, oldIssueId),
    resolveIssueLabel(db, input.organizationId, input.externalIssueId),
  ]);

  await db.thread.update(input.threadId, {
    externalIssueId: input.externalIssueId,
  });

  if (actor.userId !== null) {
    await db.insert(schema.update, {
      id: ulid().toLowerCase(),
      threadId: input.threadId,
      userId: actor.userId,
      type: "issue_changed",
      createdAt: new Date(),
      metadataStr: JSON.stringify({
        oldIssueId,
        newIssueId: input.externalIssueId,
        oldIssueLabel,
        newIssueLabel,
        ...(actor.userName ? { userName: actor.userName } : {}),
      }),
      replicatedStr: JSON.stringify({}),
    });
  }

  const updated = await db.thread.one(input.threadId).get();
  return {
    thread: updated,
    oldIssueId,
    newIssueId: input.externalIssueId,
  };
};

export const runUnlinkIssue = async (
  db: ThreadIssueLinkDb,
  input: z.infer<typeof unlinkIssueInputSchema>,
  actor: {
    userId: string | null;
    userName: string | null;
  },
) => {
  const thread = await db.thread.one(input.threadId).get();
  if (!thread || thread.organizationId !== input.organizationId) {
    throw new Error("THREAD_NOT_FOUND");
  }

  const oldIssueId = thread.externalIssueId ?? null;
  if (oldIssueId === null) {
    return { thread, unchanged: true as const };
  }

  const oldIssueLabel = await resolveIssueLabel(
    db,
    input.organizationId,
    oldIssueId,
  );

  await db.thread.update(input.threadId, { externalIssueId: null });

  if (actor.userId !== null) {
    await db.insert(schema.update, {
      id: ulid().toLowerCase(),
      threadId: input.threadId,
      userId: actor.userId,
      type: "issue_changed",
      createdAt: new Date(),
      metadataStr: JSON.stringify({
        oldIssueId,
        newIssueId: null,
        oldIssueLabel,
        newIssueLabel: null,
        ...(actor.userName ? { userName: actor.userName } : {}),
      }),
      replicatedStr: JSON.stringify({}),
    });
  }

  const updated = await db.thread.one(input.threadId).get();
  return { thread: updated, oldIssueId, newIssueId: null };
};
