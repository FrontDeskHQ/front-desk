import {
  Editor,
  EditorInput,
  EditorSubmit,
} from "@workspace/ui/components/blocks/tiptap";
import { cn } from "@workspace/ui/lib/utils";
import { mutate } from "~/lib/live-state";

type ReplyEditorProps = {
  organizationId: string | undefined;
  threadId: string;
  user: { id: string; name: string };
  captureThreadEvent: (
    eventName: string,
    properties?: Record<string, unknown>,
  ) => void;
  className?: string;
};

export const ReplyEditor = ({
  organizationId,
  threadId,
  user,
  captureThreadEvent,
  className,
}: ReplyEditorProps) => {
  return (
    <div data-slot="reply-editor">
      <Editor
        onSubmit={(value) => {
          if (!organizationId) return;

          mutate.message.create({
            threadId: threadId,
            content: value,
            userId: user.id,
            userName: user.name,
            organizationId: organizationId,
          });

          captureThreadEvent("thread:message_send");
        }}
      >
        <EditorInput
          className={cn(
            "shadow-lg bg-[#1B1B1E] border-0 border-b-0",
            className,
          )}
          placeholder="Write a reply..."
          autoFocus
        >
          <EditorSubmit />
        </EditorInput>
      </Editor>
    </div>
  );
};
