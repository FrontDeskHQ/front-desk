import { useLiveQuery } from "@live-state/sync/client";
import { Avatar } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { KeybindIsolation } from "@workspace/ui/components/keybind";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";
import {
  BotMessageSquare,
  ChevronRightIcon,
  SearchIcon,
  SendIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { mutate, query } from "~/lib/live-state";

type ToolCall = {
  name: string;
  args: unknown;
  status: "calling" | "complete";
  result?: unknown;
};

type SearchDocumentationArgs = {
  query?: string;
};

type SearchDocumentationMatch = {
  title?: string;
  url?: string;
  content?: string;
  section?: string;
};

type SupportIntelligenceChatProps = {
  threadId: string;
  organizationId: string | undefined;
  user: { id: string; name: string; image?: string | null };
  captureThreadEvent: (
    eventName: string,
    properties?: Record<string, unknown>,
  ) => void;
  className?: string;
};

const toolDisplayNames: Record<string, string> = {
  searchDocumentation: "Searched documentation",
};

const toolIcons: Record<string, React.ReactNode> = {
  searchDocumentation: <SearchIcon className="size-3.5" />,
};

const renderGenericToolPayload = (label: string, payload: unknown) => {
  if (payload == null) return null;
  return (
    <div className="mb-1">
      <span className="font-semibold">{label}: </span>
      {JSON.stringify(payload, null, 2)}
    </div>
  );
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const getSearchDocumentationArgs = (
  value: unknown,
): SearchDocumentationArgs | null => {
  const record = asRecord(value);
  if (!record) return null;
  const query = typeof record.query === "string" ? record.query : undefined;
  return { query };
};

const getSearchDocumentationMatches = (
  value: unknown,
): SearchDocumentationMatch[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = asRecord(item);
    if (!record) return {};

    return {
      title: typeof record.title === "string" ? record.title : undefined,
      url: typeof record.url === "string" ? record.url : undefined,
      content: typeof record.content === "string" ? record.content : undefined,
      section: typeof record.section === "string" ? record.section : undefined,
    };
  });
};

const renderSearchDocumentationPayload = (toolCall: ToolCall) => {
  const args = getSearchDocumentationArgs(toolCall.args);
  const matches = getSearchDocumentationMatches(toolCall.result);

  return (
    <div className="space-y-2 font-sans text-xs leading-5">
      <div>
        <span className="font-semibold">Query: </span>
        <span>{args?.query?.trim() ? args.query : "No query provided"}</span>
      </div>

      {toolCall.status === "complete" ? (
        <div className="space-y-1">
          <div className="font-semibold">Results:</div>
          {matches.length > 0 ? (
            <ul className="list-disc pl-4 space-y-1">
              {matches.map((match, index) => (
                <li key={`${match.url ?? match.title ?? "result"}-${index}`}>
                  {match.section ? (
                    match.url ? (
                      <a
                        href={match.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-foreground-secondary hover:underline break-all"
                      >
                        {match.section}
                      </a>
                    ) : (
                      <div className="text-foreground-secondary">
                        {match.section}
                      </div>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-foreground-secondary">No results found.</div>
          )}
        </div>
      ) : null}
    </div>
  );
};

const renderToolCallPayload = (toolCall: ToolCall) => {
  switch (toolCall.name) {
    case "searchDocumentation": {
      return renderSearchDocumentationPayload(toolCall);
    }
    default: {
      return (
        <>
          {renderGenericToolPayload("Args", toolCall.args)}
          {toolCall.status === "complete"
            ? renderGenericToolPayload("Result", toolCall.result)
            : null}
        </>
      );
    }
  }
};

function ToolCallBlock({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  const displayName = toolDisplayNames[toolCall.name] ?? toolCall.name;

  return (
    <div className="my-1.5">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-sm text-foreground-secondary hover:text-foreground transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span>{displayName}</span>
        {toolCall.status === "calling" ? (
          <Spinner className="size-3 animate-spin" />
        ) : (
          <ChevronRightIcon
            className={cn(
              "size-3 transition-transform duration-150",
              expanded && "rotate-90",
            )}
          />
        )}
      </button>
      {expanded && (
        <div className="mt-1 pl-4.5 text-xs font-mono whitespace-pre-wrap text-foreground-secondary max-h-48 overflow-y-auto">
          {renderToolCallPayload(toolCall)}
        </div>
      )}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      <span className="size-1.5 rounded-full bg-foreground-secondary animate-pulse [animation-delay:0ms]" />
      <span className="size-1.5 rounded-full bg-foreground-secondary animate-pulse [animation-delay:200ms]" />
      <span className="size-1.5 rounded-full bg-foreground-secondary animate-pulse [animation-delay:400ms]" />
    </div>
  );
}

function MessageGroup({
  role,
  messages,
  user,
}: {
  role: string;
  messages: Array<{
    id: string;
    content: string;
    toolCalls: string | null;
  }>;
  user: { id: string; name: string; image?: string | null };
}) {
  const isAssistant = role === "assistant";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 mb-0.5">
        {isAssistant ? (
          <>
            <div className="size-5 rounded-full bg-primary/10 flex items-center justify-center">
              <BotMessageSquare className="size-3 text-primary" />
            </div>
            <span className="text-xs font-medium text-foreground-secondary">
              Support Intelligence
            </span>
          </>
        ) : (
          <>
            <Avatar
              variant="user"
              size="md"
              src={user.image}
              fallback={user.name}
            />
            <span className="text-xs font-medium text-foreground-secondary">
              {user.name}
            </span>
          </>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {messages.map((msg) => {
          let toolCalls: ToolCall[] = [];
          if (msg.toolCalls) {
            try {
              const parsed = JSON.parse(msg.toolCalls);
              toolCalls = Array.isArray(parsed) ? parsed : [];
            } catch {
              toolCalls = [];
            }
          }
          const isThinking =
            isAssistant && !msg.content && toolCalls.length === 0;

          return (
            <div key={msg.id}>
              {isThinking && <ThinkingDots />}
              {toolCalls.map((tc, i) => (
                <ToolCallBlock key={`${msg.id}-tc-${i}`} toolCall={tc} />
              ))}
              {msg.content && (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const SupportIntelligenceChat = ({
  threadId,
  organizationId,
  user,
  captureThreadEvent,
  className,
}: SupportIntelligenceChatProps) => {
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Find or create agent chat session for this thread
  const agentChats = useLiveQuery(
    query.agentChat.where({
      threadId,
      organizationId,
      userId: user.id,
    }),
  );

  const agentChat = agentChats?.[0];

  // Auto-create chat session if none exists
  useEffect(() => {
    if (agentChats && agentChats.length === 0 && organizationId) {
      mutate.agentChat.create({ organizationId, threadId });
    }
  }, [agentChats, organizationId, threadId]);

  // Query messages for current chat
  const messagesQuery = agentChat
    ? query.agentChatMessage
        .where({ agentChatId: agentChat.id })
        .orderBy("createdAt", "asc")
    : query.agentChatMessage.where({ agentChatId: "__none__" });

  const messages = useLiveQuery(messagesQuery);

  // Group messages by consecutive same-role sequences
  const messageGroups = useMemo(() => {
    if (!messages || !Array.isArray(messages)) return [];
    const groups: Array<{
      role: string;
      messages: Array<{
        id: string;
        content: string;
        toolCalls: string | null;
      }>;
    }> = [];

    for (const msg of messages) {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.role === msg.role) {
        lastGroup.messages.push({
          id: msg.id,
          content: msg.content,
          toolCalls: (msg as any).toolCalls ?? null,
        });
      } else {
        groups.push({
          role: msg.role,
          messages: [
            {
              id: msg.id,
              content: msg.content,
              toolCalls: (msg as any).toolCalls ?? null,
            },
          ],
        });
      }
    }
    return groups;
  }, [messages]);

  // Auto-scroll on message changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async () => {
    if (!inputValue.trim() || !agentChat || isSending) return;
    const message = inputValue.trim();
    setInputValue("");
    setIsSending(true);
    try {
      await mutate.agentChat.sendMessage({
        chatId: agentChat.id,
        message,
      });
      captureThreadEvent("thread:si_message_send");
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={cn("flex flex-col max-h-[384px]", className)}>
      {messageGroups.length > 0 ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messageGroups.map((group, i) => (
            <MessageGroup
              // biome-ignore lint/suspicious/noArrayIndexKey: it's ok
              key={`group-${i}`}
              role={group.role}
              messages={group.messages}
              user={user}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
      ) : null}
      <KeybindIsolation
        className={cn(
          "p-3 flex gap-2",
          messageGroups.length > 0 && "border-t border-input",
        )}
      >
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this thread..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          disabled={!agentChat || isSending}
        />
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={handleSend}
          disabled={!inputValue.trim() || !agentChat || isSending}
        >
          <SendIcon className="size-4" />
        </Button>
      </KeybindIsolation>
    </div>
  );
};
