import {
  Editor,
  EditorInput,
  EditorSubmit,
} from "@workspace/ui/components/blocks/tiptap";
import { ulid } from "ulid";
import { mutate, query } from "~/lib/live-state";

type ReplyEditorProps = {
  organizationId: string | undefined;
  threadId: string;
  user: { id: string; name: string };
  captureThreadEvent: (
    eventName: string,
    properties?: Record<string, unknown>,
  ) => void;
};

export const ReplyEditor = ({
  organizationId,
  threadId,
  user,
  captureThreadEvent,
}: ReplyEditorProps) => {
  return (
    <div data-slot="reply-editor">
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
          className="shadow-lg bg-[#1B1B1E] border-0 border-b-0"
          placeholder="Write a reply..."
          autoFocus
        >
          <EditorSubmit />
        </EditorInput>
      </Editor>
    </div>
  );
};
