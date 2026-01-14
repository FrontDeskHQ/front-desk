import {
  Editor,
  EditorInput,
  EditorSubmit,
} from "@workspace/ui/components/blocks/tiptap";
import { cn } from "@workspace/ui/lib/utils";
import { ulid } from "ulid";
import { mutate, query } from "~/lib/live-state";
import {
  LabelSuggestions,
  usePendingLabelSuggestions,
} from "./label-suggestions";

type ThreadInputAreaProps = {
  threadId: string;
  organizationId: string | undefined;
  threadLabels: Array<{ id: string; label: { id: string } }> | undefined;
  user: { id: string; name: string };
};

export const ThreadInputArea = ({
  threadId,
  organizationId,
  threadLabels,
  user,
}: ThreadInputAreaProps) => {
  const { suggestedLabels, suggestion } = usePendingLabelSuggestions({
    threadId,
    organizationId,
    threadLabels,
  });

  const hasSuggestions = suggestedLabels?.length > 0;

  return (
    <div className="bottom-2.5 w-full flex flex-col bg-background-tertiary rounded-md border border-input">
      <LabelSuggestions
        threadId={threadId}
        organizationId={organizationId}
        suggestedLabels={suggestedLabels}
        threadLabels={threadLabels}
        suggestion={suggestion}
      />
      <Editor
        onSubmit={(value) => {
          if (!organizationId) return;
          const author = query.author.first({ userId: user.id }).get();
          let authorId = author?.id;

          if (!authorId) {
            authorId = ulid().toLowerCase();

            mutate.author.insert({
              id: authorId,
              userId: user.id,
              metaId: null,
              name: user.name,
              organizationId: organizationId,
            });
          }

          mutate.message.insert({
            id: ulid().toLowerCase(),
            authorId: authorId,
            content: JSON.stringify(value),
            threadId: threadId,
            createdAt: new Date(),
            origin: null,
            externalMessageId: null,
          });
        }}
      >
        <EditorInput
          className={cn(
            "shadow-lg bg-[#1B1B1E] border-0",
            hasSuggestions && "border-t border-input",
          )}
          placeholder="Write a reply..."
        >
          <EditorSubmit />
        </EditorInput>
      </Editor>
    </div>
  );
};
