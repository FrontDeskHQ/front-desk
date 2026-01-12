import { ulid } from "ulid";
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
