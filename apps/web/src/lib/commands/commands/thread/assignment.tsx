import { Avatar } from "@workspace/ui/components/avatar";
import { ChevronRight, CircleUser, User } from "lucide-react";
import { assignThreadToUser } from "~/actions/threads";
import type { Command, CommandPage } from "../../types";

type AssignmentCommandsParams = {
  threadId: string;
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
  orgUsers: Array<{
    userId: string;
    user: {
      id: string;
      name: string;
      image: string | null;
    };
  }> | null;
};

export const createAssignmentCommands = ({
  threadId,
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
    assignThreadToUser({
      threadId: threadId,
      newAssignedUser,
      oldAssignedUser: {
        id: thread?.assignedUser?.id ?? null,
        name: thread?.assignedUser?.name ?? null,
      },
      userId: user.id,
    });
  };

  const commands: Command[] = [
    {
      id: "assign-to",
      label: "Assign to...",
      icon: <User />,
      pageId: "assign-user",
      shortcut: "a",
    },
    {
      id: "quick-unassign",
      label: "Unassign",
      icon: <CircleUser />,
      onSelect: () => {
        handleAssign({ id: null, name: null });
      },
      visible: (state) => {
        return !!state.search;
      },
    },
    {
      id: "quick-self-assign",
      label: "Self Assign",
      icon: <User />,
      onSelect: () => {
        handleAssign({ id: user.id, name: user.name });
      },
      visible: (state) => {
        return !!state.search;
      },
    },
    ...(orgUsers?.map(
      (orgUser) =>
        ({
          id: `quick-assign-to-${orgUser.userId}`,
          label: (
            <div className="flex items-center gap-0.5 text-foreground-secondary">
              Assign to <ChevronRight />
              <div className="text-foreground-primary">{orgUser.user.name}</div>
            </div>
          ),
          keywords: [orgUser.user.name, "assign to", "user"],
          icon: (
            <Avatar
              variant="user"
              size="md"
              fallback={orgUser.user.name}
              src={orgUser.user.image}
            />
          ),
          visible: (state) => {
            return !!state.search;
          },
          onSelect: () => {
            handleAssign({
              id: orgUser.userId,
              name: orgUser.user.name,
            });
          },
        }) satisfies Command,
    ) ?? []),
  ];

  const assignUserPage: CommandPage = {
    id: "assign-user",
    label: "Assign to user",
    icon: <User />,
    commands: [
      {
        id: "unassigned",
        label: "Unassigned",
        icon: <CircleUser />,
        onSelect: () => {
          handleAssign({ id: null, name: null });
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
          handleAssign({
            id: orgUser.userId,
            name: orgUser.user.name,
          });
        },
      })) ?? []),
    ],
  };

  return { commands, assignUserPage };
};
