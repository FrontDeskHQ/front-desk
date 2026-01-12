import {
  StatusIndicator,
  statusValues,
} from "@workspace/ui/components/indicator";
import { updateThreadStatus } from "~/actions/threads";
import type { Command, CommandPage } from "../../types";

type StatusCommandsParams = {
  threadId: string;
  thread:
    | {
        status?: number;
      }
    | null
    | undefined;
  user: {
    id: string;
    name: string;
  };
};

export const createStatusCommands = ({
  threadId,
  thread,
  user,
}: StatusCommandsParams): {
  commands: Command[];
  statusPage: CommandPage;
} => {
  const handleStatusChange = (newStatus: number) => {
    updateThreadStatus({
      threadId,
      newStatus,
      oldStatus: thread?.status ?? 0,
      userId: user.id,
      userName: user.name,
    });
  };

  const statusEntries = Object.entries(statusValues);

  const commands: Command[] = [
    {
      id: "change-status",
      label: "Change status...",
      icon: <StatusIndicator status={thread?.status ?? 0} />,
      pageId: "status",
      shortcut: "s",
    },
    ...statusEntries.map(
      ([statusKey, statusValue]) =>
        ({
          id: `quick-status-${statusKey}`,
          label: statusValue.label,
          keywords: [statusValue.label.toLowerCase(), "status"],
          icon: <StatusIndicator status={+statusKey} />,
          visible: (state) => {
            return !!state.search;
          },
          onSelect: () => {
            handleStatusChange(+statusKey);
          },
        }) satisfies Command,
    ),
  ];

  const statusPage: CommandPage = {
    id: "status",
    label: "Change status",
    icon: <StatusIndicator status={thread?.status ?? 0} />,
    commands: statusEntries.map(([statusKey, statusValue]) => ({
      id: statusKey,
      label: statusValue.label,
      icon: <StatusIndicator status={+statusKey} />,
      onSelect: () => {
        handleStatusChange(+statusKey);
      },
    })),
  };

  return { commands, statusPage };
};
