import {
  PriorityIndicator,
  priorityText,
} from "@workspace/ui/components/indicator";
import { ChevronRight } from "lucide-react";
import { updateThreadPriority } from "~/actions/threads";
import type { Command, CommandPage } from "../../types";

type PriorityCommandsParams = {
  threadId: string;
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

const priorityLabels: Record<number, string> = {
  0: "No priority",
  1: "Low priority",
  2: "Medium priority",
  3: "High priority",
};

export const createPriorityCommands = ({
  threadId,
  thread,
  user,
}: PriorityCommandsParams): {
  commands: Command[];
  priorityPage: CommandPage;
} => {
  const handlePriorityChange = async (newPriority: number) => {
    await updateThreadPriority({
      threadId,
      newPriority,
      oldPriority: thread?.priority ?? 0,
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
                {priorityLabels[+priorityKey] ?? priorityLabel}
              </div>
            </div>
          ),
          keywords: [
            priorityLabel.toLowerCase(),
            priorityLabels[+priorityKey]?.toLowerCase() ?? "",
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
      label: priorityLabels[+priorityKey] ?? priorityLabel,
      icon: <PriorityIndicator priority={+priorityKey} />,
      onSelect: async () => {
        await handlePriorityChange(+priorityKey);
      },
    })),
  };

  return { commands, priorityPage };
};
