import { PRIORITY_LABELS } from "@workspace/schemas/signals";
import {
  PriorityIndicator,
  priorityText,
} from "@workspace/ui/components/indicator";
import { ChevronRight } from "lucide-react";
import { mutate } from "~/lib/live-state";
import type { Command, CommandPage } from "../../types";

type PriorityCommandsParams = {
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
};

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
      threadId,
      organizationId,
      priority: newPriority,
      userId: user.id,
      userName: user.name,
    });
  };

  const priorityEntries = Object.entries(priorityText);

  const commands: Command[] = [
    {
      id: "change-priority",
      label: "Change priority...",
      icon: <PriorityIndicator priority={thread?.priority ?? 0} />,
      pageId: "priority",
      shortcut: "p",
    },
    ...priorityEntries.map(
      ([priorityKey, priorityLabel]) =>
        ({
          id: `quick-priority-${priorityKey}`,
          label: (
            <div className="flex items-center gap-0.5 text-foreground-secondary">
              Change priority <ChevronRight />
              <div className="text-foreground-primary">
                {PRIORITY_LABELS[+priorityKey] ?? priorityLabel}
              </div>
            </div>
          ),
          keywords: [
            priorityLabel.toLowerCase(),
            PRIORITY_LABELS[+priorityKey]?.toLowerCase() ?? "",
            "priority",
          ].filter(Boolean),
          icon: <PriorityIndicator priority={+priorityKey} />,
          visible: (state) => {
            return !!state.search;
          },
          onSelect: async () => {
            await handlePriorityChange(+priorityKey);
          },
        }) satisfies Command,
    ),
  ];

  const priorityPage: CommandPage = {
    id: "priority",
    label: "Change priority",
    icon: <PriorityIndicator priority={thread?.priority ?? 0} />,
    commands: priorityEntries.map(([priorityKey, priorityLabel]) => ({
      id: priorityKey,
      label: PRIORITY_LABELS[+priorityKey] ?? priorityLabel,
      icon: <PriorityIndicator priority={+priorityKey} />,
      checked: thread?.priority === +priorityKey,
      onSelect: async () => {
        await handlePriorityChange(+priorityKey);
      },
    })),
  };

  return { commands, priorityPage };
};
