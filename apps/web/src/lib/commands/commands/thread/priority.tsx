import { PriorityIndicator, priorityText } from "@workspace/ui/components/indicator";
import { updateThreadPriority } from "~/actions/threads";
import type { Command, CommandPage } from "../../types";

type PriorityCommandsParams = {
  threadId: string;
  thread: {
    priority?: number;
  } | null | undefined;
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
  4: "Urgent priority",
};

export const createPriorityCommands = ({
  threadId,
  thread,
  user,
}: PriorityCommandsParams): {
  commands: Command[];
  priorityPage: CommandPage;
} => {
  const handlePriorityChange = (newPriority: number) => {
    updateThreadPriority({
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
          label: priorityLabels[+priorityKey] ?? priorityLabel,
          keywords: [
            priorityLabel.toLowerCase(),
            priorityLabels[+priorityKey]?.toLowerCase() ?? "",
            "priority",
          ].filter(Boolean),
          icon: <PriorityIndicator priority={+priorityKey} />,
          visible: (state) => {
            return !!state.search;
          },
          onSelect: () => {
            handlePriorityChange(+priorityKey);
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
      onSelect: () => {
        handlePriorityChange(+priorityKey);
      },
    })),
  };

  return { commands, priorityPage };
};
