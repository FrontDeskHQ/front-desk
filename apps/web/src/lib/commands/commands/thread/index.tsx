import { useLiveQuery } from "@live-state/sync/client";
import { getRouteApi } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { CircleUser, Copy, User } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { assignThreadToUser } from "~/actions/threads";
import { useOrganizationSwitcher } from "~/lib/hooks/query/use-organization-switcher";
import { query } from "~/lib/live-state";
import { useCommandContext } from "../..";

export const ThreadCommands = ({ threadId }: { threadId: string }) => {
  const { activeOrganization } = useOrganizationSwitcher();
  const { user } = getRouteApi("/app").useRouteContext();

  const orgUsers = useLiveQuery(
    query.organizationUser
      .where({ organizationId: activeOrganization?.id, enabled: true })
      .include({ user: true }),
  );

  const thread = useLiveQuery(
    query.thread.first({ id: threadId }).include({
      assignedUser: true,
    }),
  );

  const userIds = useMemo(() => {
    return orgUsers?.map((orgUser) => orgUser.userId) ?? [];
  }, [orgUsers]);

  useCommandContext(
    {
      id: "thread",
      label: "Thread",
      commands: [
        {
          id: "assign-to",
          label: "Assign to...",
          icon: <User />,
          pageId: "assign-user",
          shortcut: "a",
        },
        {
          id: "copy-link",
          label: "Copy Link",
          icon: <Copy />,
          onSelect: () => {
            navigator.clipboard.writeText(window.location.href);
            toast.success("Link copied to clipboard");
          },
        },
      ],
      pages: {
        "assign-user": {
          id: "assign-user",
          label: "Assign to user",
          icon: <User />,
          commands: [
            {
              id: "unassigned",
              label: "Unassigned",
              icon: <CircleUser />,
              onSelect: () => {
                assignThreadToUser({
                  threadId: threadId,
                  newAssignedUser: { id: null, name: null },
                  oldAssignedUser: {
                    id: thread?.assignedUser?.id ?? null,
                    name: thread?.assignedUser?.name ?? null,
                  },
                  userId: user.id,
                });
              },
            },
            ...(orgUsers?.map((orgUser) => ({
              id: orgUser.userId,
              label: orgUser.user.name,
              icon: (
                <Avatar
                  variant="user"
                  size="md"
                  fallback={orgUser.user.name}
                  src={orgUser.user.image}
                />
              ),
              onSelect: () => {
                assignThreadToUser({
                  threadId: threadId,
                  newAssignedUser: {
                    id: orgUser.userId,
                    name: orgUser.user.name,
                  },
                  oldAssignedUser: {
                    id: thread?.assignedUser?.id ?? null,
                    name: thread?.assignedUser?.name ?? null,
                  },
                  userId: user.id,
                });
              },
            })) ?? []),
          ],
        },
      },
    },
    true,
    [threadId, userIds],
  );

  return null;
};
