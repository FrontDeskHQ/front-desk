import {
  Editor,
  EditorInput,
  EditorSubmit,
} from "@workspace/ui/components/blocks/tiptap";
import { cn } from "@workspace/ui/lib/utils";
import { useEffect, useState } from "react";
import { ulid } from "ulid";
import { mutate, query } from "~/lib/live-state";
import {
  LabelSuggestions,
  usePendingLabelSuggestions,
} from "./support-intelligence";

type ThreadInputAreaProps = {
  threadId: string;
  organizationId: string | undefined;
  threadLabels: Array<{ id: string; label: { id: string } }> | undefined;
  user: { id: string; name: string };
  lastMessageId: string | undefined;
  captureThreadEvent: (
    eventName: string,
    properties?: Record<string, unknown>,
  ) => void;
};

export const ThreadInputArea = ({
  threadId,
  organizationId,
  threadLabels,
  lastMessageId,
  user,
  captureThreadEvent,
}: ThreadInputAreaProps) => {
  const { suggestedLabels, suggestion } = usePendingLabelSuggestions({
    threadId,
    organizationId,
    threadLabels,
    lastMessageId,
  });

  const [showBorder, setShowBorder] = useState(false);
  const hasSuggestions = (suggestedLabels?.length ?? 0) > 0;

  useEffect(() => {
    if (hasSuggestions) {
      // Show border immediately when suggestions appear
      setShowBorder(true);
      return;
    }

    // Hide border after transition finishes (200ms matches transition duration)
    const timeoutId = setTimeout(() => {
      setShowBorder(false);
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [hasSuggestions]);

  return (
    <div className="bottom-2.5 w-full flex flex-col bg-background-tertiary rounded-md border border-input">
      <LabelSuggestions
        threadId={threadId}
        organizationId={organizationId}
        suggestedLabels={suggestedLabels}
        threadLabels={threadLabels}
        suggestion={suggestion}
        captureThreadEvent={captureThreadEvent}
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

          captureThreadEvent("thread:message_send");
        }}
      >
        <EditorInput
          className={cn(
            "shadow-lg bg-[#1B1B1E] border-0",
            showBorder && "border-t border-input",
          )}
          placeholder="Write a reply..."
        >
          <EditorSubmit />
        </EditorInput>
      </Editor>
    </div>
  );
};
