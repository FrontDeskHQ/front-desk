import { Avatar } from "@workspace/ui/components/avatar";
import { ChevronRight, CircleUser, User } from "lucide-react";

import { mutate } from "~/lib/live-state";

import type { Command, CommandPage } from "../../types";

interface AssignmentCommandsParams {
  threadId: string;
  organizationId: string;
  thread:
    | {
        assignedUser?: {
          id: string;
          name: string;
        } | null;
      }
    | null
    | undefined;
  user: {
    id: string;
    name: string;
  };
  orgUsers:
    | {
        userId: string;
        user: {
          id: string;
          name: string;
          image: string | null;
        };
      }[]
    | null;
}

export const createAssignmentCommands = ({
  threadId,
  organizationId,
  thread,
  user,
  orgUsers,
}: AssignmentCommandsParams): {
  commands: Command[];
  assignUserPage: CommandPage;
} => {
  const handleAssign = (newAssignedUser: {
    id: string | null;
    name: string | null;
  }) => {
    mutate.thread.assignUser({
      assignedUserId: newAssignedUser.id,
      organizationId,
      threadId,
      userId: user.id,
      userName: user.name,
    });
  };

  const commands: Command[] = [
    {
      icon: <User />,
      id: "assign-to",
      label: "Assign to...",
      pageId: "assign-user",
      shortcut: "a",
    },
    {
      icon: <User />,
      id: "quick-self-assign",
      label: "Self assign",
      onSelect: async () => {
        await handleAssign({ id: user.id, name: user.name });
      },
    },
    {
      icon: <CircleUser />,
      id: "quick-unassign",
      label: "Unassign",
      onSelect: async () => {
        await handleAssign({ id: null, name: null });
      },
      visible: (state) => {
        return !!state.search;
      },
    },
    ...(orgUsers?.map(
      (orgUser) =>
        ({
          icon: (
            <Avatar
              variant="user"
              size="md"
              fallback={orgUser.user.name}
              src={orgUser.user.image}
            />
          ),
          id: `quick-assign-to-${orgUser.userId}`,
          keywords: [orgUser.user.name, "assign to", "user"],
          label: (
            <div className="flex items-center gap-0.5 text-foreground-secondary">
              Assign to <ChevronRight />
              <div className="text-foreground-primary">{orgUser.user.name}</div>
            </div>
          ),
          onSelect: async () => {
            await handleAssign({
              id: orgUser.userId,
              name: orgUser.user.name,
            });
          },
          visible: (state) => {
            return !!state.search;
          },
        }) satisfies Command
    ) ?? []),
  ];

  const assignUserPage: CommandPage = {
    commands: [
      {
        id: "unassigned",
        label: "Unassigned",
        icon: <CircleUser />,
        checked: !thread?.assignedUser,
        onSelect: async () => {
          await handleAssign({ id: null, name: null });
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
        checked: thread?.assignedUser?.id === orgUser.userId,
        onSelect: async () => {
          await handleAssign({
            id: orgUser.userId,
            name: orgUser.user.name,
          });
        },
      })) ?? []),
    ],
    icon: <User />,
    id: "assign-user",
    label: "Assign to user",
  };

  return { assignUserPage, commands };
};
