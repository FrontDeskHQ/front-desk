import {
  StatusIndicator,
  statusValues,
} from "@workspace/ui/components/indicator";
import { ChevronRight } from "lucide-react";

import { mutate } from "~/lib/live-state";

import type { Command, CommandPage } from "../../types";

interface StatusCommandsParams {
  threadId: string;
  organizationId: string;
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
}

export const createStatusCommands = ({
  threadId,
  organizationId,
  thread,
  user,
}: StatusCommandsParams): {
  commands: Command[];
  statusPage: CommandPage;
} => {
  const handleStatusChange = (newStatus: number) => {
    mutate.thread.setStatus({
      organizationId,
      status: newStatus,
      threadId,
      userId: user.id,
      userName: user.name,
    });
  };

  const statusEntries = Object.entries(statusValues);

  const commands: Command[] = [
    {
      icon: <StatusIndicator status={0} />,
      id: "change-status",
      label: "Change status...",
      pageId: "status",
      shortcut: "s",
    },
    ...statusEntries.map(
      ([statusKey, statusValue]) =>
        ({
          icon: <StatusIndicator status={+statusKey} />,
          id: `quick-status-${statusKey}`,
          keywords: [statusValue.label.toLowerCase(), "status"],
          label: (
            <div className="flex items-center gap-0.5 text-foreground-secondary">
              Change status <ChevronRight />
              <div className="text-foreground-primary">{statusValue.label}</div>
            </div>
          ),
          onSelect: async () => {
            await handleStatusChange(+statusKey);
          },
          visible: (state) => {
            return !!state.search;
          },
        }) satisfies Command
    ),
  ];

  const statusPage: CommandPage = {
    commands: statusEntries.map(([statusKey, statusValue]) => ({
      id: statusKey,
      label: statusValue.label,
      icon: <StatusIndicator status={+statusKey} />,
      checked: thread?.status === +statusKey,
      onSelect: async () => {
        await handleStatusChange(+statusKey);
      },
    })),
    icon: <StatusIndicator status={thread?.status ?? 0} />,
    id: "status",
    label: "Change status",
  };

  return { commands, statusPage };
};
