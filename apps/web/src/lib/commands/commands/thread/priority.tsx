import { PRIORITY_LABELS } from "@workspace/schemas/signals";
import {
  PriorityIndicator,
  priorityText,
} from "@workspace/ui/components/indicator";
import { ChevronRight } from "lucide-react";

import { mutate } from "~/lib/live-state";

import type { Command, CommandPage } from "../../types";

interface PriorityCommandsParams {
  threadId: string;
  organizationId: string;
  thread:
    | {
        priority?: number;
      }
    | null
    | undefined;
  user: {
    id: string;
    name: string;
  };
}

export const createPriorityCommands = ({
  threadId,
  organizationId,
  thread,
  user,
}: PriorityCommandsParams): {
  commands: Command[];
  priorityPage: CommandPage;
} => {
  const handlePriorityChange = (newPriority: number) => {
    mutate.thread.setPriority({
      organizationId,
      priority: newPriority,
      threadId,
      userId: user.id,
      userName: user.name,
    });
  };

  const priorityEntries = Object.entries(priorityText);

  const commands: Command[] = [
    {
      icon: <PriorityIndicator priority={thread?.priority ?? 0} />,
      id: "change-priority",
      label: "Change priority...",
      pageId: "priority",
      shortcut: "p",
    },
    ...priorityEntries.map(
      ([priorityKey, priorityLabel]) =>
        ({
          icon: <PriorityIndicator priority={+priorityKey} />,
          id: `quick-priority-${priorityKey}`,
          keywords: [
            priorityLabel.toLowerCase(),
            PRIORITY_LABELS[+priorityKey]?.toLowerCase() ?? "",
            "priority",
          ].filter(Boolean),
          label: (
            <div className="flex items-center gap-0.5 text-foreground-secondary">
              Change priority <ChevronRight />
              <div className="text-foreground-primary">
                {PRIORITY_LABELS[+priorityKey] ?? priorityLabel}
              </div>
            </div>
          ),
          onSelect: async () => {
            await handlePriorityChange(+priorityKey);
          },
          visible: (state) => {
            return !!state.search;
          },
        }) satisfies Command
    ),
  ];

  const priorityPage: CommandPage = {
    commands: priorityEntries.map(([priorityKey, priorityLabel]) => ({
      id: priorityKey,
      label: PRIORITY_LABELS[+priorityKey] ?? priorityLabel,
      icon: <PriorityIndicator priority={+priorityKey} />,
      checked: thread?.priority === +priorityKey,
      onSelect: async () => {
        await handlePriorityChange(+priorityKey);
      },
    })),
    icon: <PriorityIndicator priority={thread?.priority ?? 0} />,
    id: "priority",
    label: "Change priority",
  };

  return { commands, priorityPage };
};
