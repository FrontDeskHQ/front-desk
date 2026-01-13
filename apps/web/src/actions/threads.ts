import { ulid } from "ulid";
import { fetchClient, mutate } from "~/lib/live-state";
import { priorityText } from "@workspace/ui/components/indicator";
import { statusValues } from "@workspace/ui/components/indicator";

const useMutate = ({ live = true }: Options = { live: true }) => {
  return live ? mutate : fetchClient.mutate;
};

type Options = {
  live?: boolean;
};

export const assignThreadToUser = async (
  {
    threadId,
    newAssignedUser,
    oldAssignedUser,
    userId,
  }: {
    threadId: string;
    newAssignedUser: { id: string | null; name: string | null };
    oldAssignedUser: { id: string | null; name: string | null };
    userId: string;
  },
  options?: Options
) => {
  const oldAssignedUserId = oldAssignedUser?.id ?? null;
  const oldAssignedUserName = oldAssignedUser?.name ?? null;
  const newAssignedUserId = newAssignedUser.id;
  const newAssignedUserName = newAssignedUser.name;

  if (oldAssignedUserId === newAssignedUserId) {
    return;
  }

  await useMutate(options).thread.update(threadId, {
    assignedUserId: newAssignedUserId,
  });

  await useMutate(options).update.insert({
    id: ulid().toLowerCase(),
    threadId: threadId,
    userId: userId ?? null,
    type: "assigned_changed",
    createdAt: new Date(),
    metadataStr: JSON.stringify({
      oldAssignedUserId,
      newAssignedUserId,
      oldAssignedUserName,
      newAssignedUserName,
    }),
    replicatedStr: JSON.stringify({}),
  });
};

export const updateThreadStatus = async (
  {
    threadId,
    newStatus,
    oldStatus,
    userId,
    userName,
  }: {
    threadId: string;
    newStatus: number;
    oldStatus: number;
    userId: string;
    userName: string;
  },
  options?: Options
) => {
  if (oldStatus === newStatus) {
    return;
  }

  const oldStatusLabel = statusValues[oldStatus]?.label ?? "Unknown";
  const newStatusLabel = statusValues[newStatus]?.label ?? "Unknown";

  await useMutate(options).thread.update(threadId, {
    status: newStatus,
  });

  await useMutate(options).update.insert({
    id: ulid().toLowerCase(),
    threadId: threadId,
    userId: userId ?? null,
    type: "status_changed",
    createdAt: new Date(),
    metadataStr: JSON.stringify({
      oldStatus,
      newStatus,
      oldStatusLabel,
      newStatusLabel,
      userName,
    }),
    replicatedStr: JSON.stringify({}),
  });
};

export const updateThreadPriority = async (
  {
    threadId,
    newPriority,
    oldPriority,
    userId,
    userName,
  }: {
    threadId: string;
    newPriority: number;
    oldPriority: number;
    userId: string;
    userName: string;
  },
  options?: Options
) => {
  if (oldPriority === newPriority) {
    return;
  }

  const priorityLabels: Record<number, string> = {
    0: "No priority",
    1: "Low priority",
    2: "Medium priority",
    3: "High priority",
    4: "Urgent priority",
  };

  const oldPriorityLabel = priorityLabels[oldPriority] ?? priorityText[oldPriority] ?? "Unknown";
  const newPriorityLabel = priorityLabels[newPriority] ?? priorityText[newPriority] ?? "Unknown";

  await useMutate(options).thread.update(threadId, {
    priority: newPriority,
  });

  await useMutate(options).update.insert({
    id: ulid().toLowerCase(),
    threadId: threadId,
    userId: userId ?? null,
    type: "priority_changed",
    createdAt: new Date(),
    metadataStr: JSON.stringify({
      oldPriority,
      newPriority,
      oldPriorityLabel,
      newPriorityLabel,
      userName,
    }),
    replicatedStr: JSON.stringify({}),
  });
};
