/* mirror: support intelligence chat — apps/web/src/components/threads/thread-toolbar/support-intelligence-chat.tsx
 * fork: apps/web/src/components/threads/thread-toolbar/support-intelligence-chat.tsx @ 1581afde
 *   why: live-state agentChat + messages, mutate draft/send, streaming tool calls
 * reuse: Button, EditableRichText, AgentMessageContent
 * state: active Draft Reply + completed search/draft tool calls from fixture
 * marketing: none — no AnimatePresence; draft always visible when provided
 */

import { EditableRichText } from "@workspace/ui/components/blocks/tiptap";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import {
  CheckIcon,
  ChevronRightIcon,
  PenLineIcon,
  SendIcon,
  XIcon,
} from "lucide-react";

import { AgentMessageContent } from "~/components/threads/thread-toolbar/agent-message-content";

export interface MockSiToolCall {
  name: string;
  displayName: string;
}

export interface MockSiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: MockSiToolCall[];
}

interface MockSupportIntelligenceChatProps {
  draft?: string;
  messages?: MockSiMessage[];
  className?: string;
}

function MockToolCallRow({ displayName }: { displayName: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 text-sm text-foreground-secondary">
      <span>{displayName}</span>
      <ChevronRightIcon className="size-3" />
    </div>
  );
}

function MockDraftEditor({ draft }: { draft: string }) {
  return (
    <div className="shrink-0 border-b border-input p-4 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <PenLineIcon className="size-3.5" />
        <span>Draft Reply</span>
      </div>
      <div className="text-sm max-h-52 min-h-0 overflow-y-auto -mr-4">
        <EditableRichText content={draft} />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" tabIndex={-1}>
          <XIcon className="size-3.5 mr-1" />
          Dismiss
        </Button>
        <Button size="sm" variant="primary" tabIndex={-1}>
          <CheckIcon className="size-3.5 mr-1" />
          Accept & Send
        </Button>
      </div>
    </div>
  );
}

function MockMessageGroup({ message }: { message: MockSiMessage }) {
  const isAssistant = message.role === "assistant";

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          isAssistant
            ? "flex flex-col gap-2 px-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
            : "rounded-lg bg-muted/50 border border-input px-3 py-2"
        )}
      >
        {message.toolCalls?.map((tc) => (
          <MockToolCallRow key={tc.name} displayName={tc.displayName} />
        ))}
        {message.content ? (
          isAssistant ? (
            <AgentMessageContent content={message.content} />
          ) : (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          )
        ) : null}
      </div>
    </div>
  );
}

export function MockSupportIntelligenceChat({
  draft,
  messages = [],
  className,
}: MockSupportIntelligenceChatProps) {
  const hasDraft = Boolean(draft && draft.length > 0);
  const hasMessages = messages.length > 0;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col",
        hasDraft ? "max-h-[512px]" : "max-h-[384px]",
        className
      )}
    >
      {hasDraft && draft ? <MockDraftEditor draft={draft} /> : null}
      {hasMessages ? (
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto p-4 space-y-4",
            hasDraft && "max-h-[256px]"
          )}
        >
          {messages.map((message) => (
            <MockMessageGroup key={message.id} message={message} />
          ))}
        </div>
      ) : null}
      <div
        className={cn(
          "shrink-0 grow-0 p-3 flex gap-2",
          hasMessages && "border-t border-input"
        )}
      >
        <div className="flex-1 bg-transparent text-sm text-muted-foreground">
          Ask about this thread...
        </div>
        <Button size="icon-sm" variant="ghost" tabIndex={-1} disabled>
          <SendIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}
