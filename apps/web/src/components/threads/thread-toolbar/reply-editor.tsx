import type { JSONContent } from "@workspace/ui/components/blocks/tiptap";
import {
  Editor,
  EditorInput,
  EditorSubmit,
} from "@workspace/ui/components/blocks/tiptap";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";

import { mutate } from "~/lib/live-state";

interface ReplyEditorProps {
  organizationId: string | undefined;
  threadId: string;
  user: { id: string; name: string };
  captureThreadEvent: (
    eventName: string,
    properties?: Record<string, unknown>
  ) => void;
  className?: string;
  value: JSONContent[];
  onValueChange: (value: JSONContent[]) => void;
  onSubmitted: () => void;
}

export const ReplyEditor = ({
  organizationId,
  threadId,
  user,
  captureThreadEvent,
  className,
  value,
  onValueChange,
  onSubmitted,
}: ReplyEditorProps) => (
  <div data-slot="reply-editor">
    <Editor
      value={value}
      onValueChange={onValueChange}
      onSubmit={async (nextValue) => {
        if (!organizationId) {
          toast.error("Could not send the reply — no organization loaded.");
          return;
        }

        try {
          await mutate.message.create({
            threadId,
            content: nextValue,
            userId: user.id,
            userName: user.name,
            organizationId,
          });
        } catch {
          toast.error("Could not send the reply. Try again.");
          return;
        }

        captureThreadEvent("thread:message_send");
        onSubmitted();
      }}
    >
      <EditorInput
        className={cn("shadow-lg bg-[#1B1B1E] border-0 border-b-0", className)}
        placeholder="Write a reply..."
        autoFocus
      >
        <EditorSubmit />
      </EditorInput>
    </Editor>
  </div>
);
