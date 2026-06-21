import { fetchClient, mutate } from "~/lib/live-state";

const useMutate = ({ live = true }: Options = { live: true }) => {
  return live ? mutate : fetchClient.mutate;
};

type Options = {
  live?: boolean;
};

export const assignThreadToUser = async (
  {
    threadId,
    organizationId,
    newAssignedUser,
    oldAssignedUser,
    userId,
    userName,
  }: {
    threadId: string;
    organizationId: string;
    newAssignedUser: { id: string | null; name: string | null };
    oldAssignedUser: { id: string | null; name: string | null };
    userId: string;
    userName: string;
  },
  options?: Options
) => {
  const oldAssignedUserId = oldAssignedUser?.id ?? null;
  const newAssignedUserId = newAssignedUser.id;

  if (oldAssignedUserId === newAssignedUserId) {
    return;
  }

  await useMutate(options).thread.assignUser({
    threadId,
    organizationId,
    assignedUserId: newAssignedUserId,
    userId,
    userName,
  });
};

export const updateThreadStatus = async (
  {
    threadId,
    organizationId,
    newStatus,
    oldStatus,
    userId,
    userName,
    source,
  }: {
    threadId: string;
    organizationId: string;
    newStatus: number;
    oldStatus: number;
    userId: string;
    userName: string;
    source?: string;
  },
  options?: Options
) => {
  if (oldStatus === newStatus) {
    return;
  }

  await useMutate(options).thread.setStatus({
    threadId,
    organizationId,
    status: newStatus,
    userId,
    userName,
    source,
  });
};

export const updateThreadPriority = async (
  {
    threadId,
    organizationId,
    newPriority,
    oldPriority,
    userId,
    userName,
  }: {
    threadId: string;
    organizationId: string;
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

  await useMutate(options).thread.setPriority({
    threadId,
    organizationId,
    priority: newPriority,
    userId,
    userName,
  });
};
