import type { InferLiveObject } from "@live-state/sync";
import type { schema } from "api/schema";
import { Tag } from "lucide-react";
import { ulid } from "ulid";

import { mutate } from "~/lib/live-state";

import type { Command, CommandPage } from "../../types";

type LabelRecord = InferLiveObject<typeof schema.label>;
type ThreadLabelRecord = InferLiveObject<
  typeof schema.threadLabel,
  { label: true }
>;

interface LabelCommandsParams {
  labels: LabelRecord[] | null;
  threadId: string;
  threadLabels: ThreadLabelRecord[] | null;
}

export const createLabelCommands = ({
  labels,
  threadId,
  threadLabels,
}: LabelCommandsParams): {
  commands: Command[];
  labelsPage: CommandPage;
} => {
  const threadLabelByLabelId = new Map(
    threadLabels?.map((threadLabel) => [threadLabel.label.id, threadLabel]) ??
      []
  );

  const commands: Command[] = [
    {
      icon: <Tag />,
      id: "change-labels",
      label: "Change labels...",
      pageId: "labels",
      shortcut: "l",
    },
  ];

  const labelsPage: CommandPage = {
    commands:
      labels?.map((label) => {
        const threadLabel = threadLabelByLabelId.get(label.id);

        return {
          checked: threadLabel?.enabled ?? false,
          icon: (
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: label.color }}
            />
          ),
          id: label.id,
          keepOpen: true,
          keywords: [label.name, "label"],
          label: label.name,
          onSelect: () => {
            if (threadLabel?.enabled) {
              mutate.label.detachFromThread({
                threadLabelId: threadLabel.id,
              });
              return;
            }

            mutate.label.attachToThread({
              id: ulid().toLowerCase(),
              labelId: label.id,
              threadId,
            });
          },
        } satisfies Command;
      }) ?? [],
    icon: <Tag />,
    id: "labels",
    label: "Change labels",
    multiple: true,
  };

  return { commands, labelsPage };
};
