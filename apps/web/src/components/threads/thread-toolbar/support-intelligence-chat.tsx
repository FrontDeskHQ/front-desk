import { useLiveQuery } from "@live-state/sync/client";
import {
  EditableRichText,
  type JSONContent,
} from "@workspace/ui/components/blocks/tiptap";
import { Button } from "@workspace/ui/components/button";
import { KeybindIsolation } from "@workspace/ui/components/keybind";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";
import { stringify } from "@workspace/utils/tiptap-md";
import {
  CheckIcon,
  ChevronRightIcon,
  EyeIcon,
  FileTextIcon,
  ListIcon,
  PenLineIcon,
  SearchIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { mutate, query } from "~/lib/live-state";

type ToolCall = {
  name: string;
  args: unknown;
  status: "calling" | "complete";
  result?: unknown;
};

const SearchDocumentationArgsSchema = z.object({
  query: z.string().optional(),
});

const SearchDocumentationMatchSchema = z.object({
  title: z.string().optional(),
  url: z.string().optional(),
  content: z.string().optional(),
  section: z.string().optional(),
});

const SetDraftArgsSchema = z.object({
  content: z.string().optional(),
});

const SearchThreadsArgsSchema = z.object({
  query: z.string().optional(),
});

const SearchThreadsResultItemSchema = z.object({
  _id: z.string(),
  name: z.string(),
  status: z.string().optional(),
  priority: z.string().optional(),
  author: z.string().optional(),
  createdAt: z.string().optional(),
  matchingMessageSnippet: z.string().optional(),
});

const GetThreadArgsSchema = z.object({
  threadId: z.string().optional(),
});

const GetThreadResultSchema = z.object({
  _id: z.string().optional(),
  name: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  author: z.string().optional(),
  assignee: z.string().nullable().optional(),
  labels: z.array(z.string()).optional(),
  messageCount: z.number().optional(),
  messages: z
    .array(
      z.object({
        author: z.string(),
        content: z.string(),
        createdAt: z.string(),
      }),
    )
    .optional(),
  error: z.string().optional(),
});

const ListThreadsArgsSchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  limit: z.number().optional(),
});

const ListThreadsResultItemSchema = z.object({
  _id: z.string(),
  name: z.string(),
  status: z.string().optional(),
  priority: z.string().optional(),
  author: z.string().optional(),
  assignee: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});

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
  setDraft: "Drafted a reply",
  getDraft: "Read current draft",
  searchThreads: "Searched threads",
  getThread: "Read thread details",
  listThreads: "Listed threads",
};

const toolIcons: Record<string, React.ReactNode> = {
  searchDocumentation: <SearchIcon className="size-3.5" />,
  setDraft: <PenLineIcon className="size-3.5" />,
  getDraft: <EyeIcon className="size-3.5" />,
  searchThreads: <SearchIcon className="size-3.5" />,
  getThread: <FileTextIcon className="size-3.5" />,
  listThreads: <ListIcon className="size-3.5" />,
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

const getSearchDocumentationArgs = (
  value: unknown,
): z.infer<typeof SearchDocumentationArgsSchema> | null => {
  const result = SearchDocumentationArgsSchema.safeParse(value);
  return result.success ? result.data : null;
};

const getSearchDocumentationMatches = (
  value: unknown,
): z.infer<typeof SearchDocumentationMatchSchema>[] => {
  const result = z.array(SearchDocumentationMatchSchema).safeParse(value);
  return result.success ? result.data : [];
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

const renderSetDraftPayload = (toolCall: ToolCall) => {
  const result = SetDraftArgsSchema.safeParse(toolCall.args);
  const content = result.success ? (result.data.content ?? null) : null;

  return (
    <div className="space-y-1 font-sans text-xs leading-5">
      {content ? (
        <div className="text-foreground-secondary line-clamp-3">{content}</div>
      ) : (
        <div className="text-foreground-secondary">No content</div>
      )}
    </div>
  );
};

const GetDraftResultSchema = z.object({
  hasDraft: z.boolean(),
  content: z.string().nullable(),
});

const renderGetDraftPayload = (toolCall: ToolCall) => {
  if (toolCall.status !== "complete") return null;
  const result = GetDraftResultSchema.safeParse(toolCall.result);
  if (!result.success) return null;

  return (
    <div className="space-y-1 font-sans text-xs leading-5">
      {result.data.hasDraft ? (
        <div className="text-foreground-secondary line-clamp-3">
          {result.data.content}
        </div>
      ) : (
        <div className="text-foreground-secondary">No draft</div>
      )}
    </div>
  );
};

const renderSearchThreadsPayload = (toolCall: ToolCall) => {
  const args = SearchThreadsArgsSchema.safeParse(toolCall.args);
  const results = z
    .array(SearchThreadsResultItemSchema)
    .safeParse(toolCall.result);

  return (
    <div className="space-y-2 font-sans text-xs leading-5">
      <div>
        <span className="font-semibold">Query: </span>
        <span>
          {args.success && args.data.query?.trim()
            ? args.data.query
            : "No query provided"}
        </span>
      </div>

      {toolCall.status === "complete" ? (
        <div className="space-y-1">
          <div className="font-semibold">Results:</div>
          {results.success && results.data.length > 0 ? (
            <ul className="list-disc pl-4 space-y-1.5">
              {results.data.map((thread, index) => (
                <li key={`${thread._id}-${index}`}>
                  <div className="text-foreground">{thread.name}</div>
                  <div className="text-foreground-secondary">
                    {[thread.status, thread.priority, thread.author]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {thread.matchingMessageSnippet && (
                    <div className="text-foreground-secondary line-clamp-2 mt-0.5">
                      {thread.matchingMessageSnippet}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-foreground-secondary">No threads found.</div>
          )}
        </div>
      ) : null}
    </div>
  );
};

const renderGetThreadPayload = (toolCall: ToolCall) => {
  const args = GetThreadArgsSchema.safeParse(toolCall.args);
  const result = GetThreadResultSchema.safeParse(toolCall.result);

  if (toolCall.status !== "complete") {
    return (
      <div className="font-sans text-xs leading-5 text-foreground-secondary">
        Loading thread
        {args.success && args.data.threadId
          ? ` ${args.data.threadId.slice(0, 8)}...`
          : ""}
      </div>
    );
  }

  if (!result.success) return renderGenericToolPayload("Result", toolCall.result);

  if (result.data.error) {
    return (
      <div className="font-sans text-xs leading-5 text-foreground-secondary">
        {result.data.error}
      </div>
    );
  }

  return (
    <div className="space-y-2 font-sans text-xs leading-5">
      <div>
        <span className="font-semibold">{result.data.name}</span>
      </div>
      <div className="text-foreground-secondary">
        {[
          result.data.status,
          result.data.priority,
          result.data.author,
          result.data.assignee ? `Assigned: ${result.data.assignee}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>
      {result.data.labels && result.data.labels.length > 0 && (
        <div className="text-foreground-secondary">
          Labels: {result.data.labels.join(", ")}
        </div>
      )}
      {result.data.messageCount != null && (
        <div className="text-foreground-secondary">
          {result.data.messageCount} message
          {result.data.messageCount !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
};

const renderListThreadsPayload = (toolCall: ToolCall) => {
  const args = ListThreadsArgsSchema.safeParse(toolCall.args);
  const results = z
    .array(ListThreadsResultItemSchema)
    .safeParse(toolCall.result);

  const filters = [args.success && args.data.status, args.success && args.data.priority].filter(
    Boolean,
  );

  return (
    <div className="space-y-2 font-sans text-xs leading-5">
      {filters.length > 0 && (
        <div>
          <span className="font-semibold">Filters: </span>
          <span>{filters.join(", ")}</span>
        </div>
      )}

      {toolCall.status === "complete" ? (
        <div className="space-y-1">
          {results.success && results.data.length > 0 ? (
            <ul className="list-disc pl-4 space-y-1.5">
              {results.data.map((thread, index) => (
                <li key={`${thread._id}-${index}`}>
                  <div className="text-foreground">{thread.name}</div>
                  <div className="text-foreground-secondary">
                    {[
                      thread.status,
                      thread.priority,
                      thread.author,
                      thread.assignee ? `→ ${thread.assignee}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-foreground-secondary">No threads found.</div>
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
    case "setDraft": {
      return renderSetDraftPayload(toolCall);
    }
    case "getDraft": {
      return renderGetDraftPayload(toolCall);
    }
    case "searchThreads": {
      return renderSearchThreadsPayload(toolCall);
    }
    case "getThread": {
      return renderGetThreadPayload(toolCall);
    }
    case "listThreads": {
      return renderListThreadsPayload(toolCall);
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
    <div className="my-1.5 first:mt-0">
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

const thinkingTexts = [
  "Thinking...",
  "Analyzing thread...",
  "Reading context...",
  "Processing...",
  "Considering options...",
  "Looking into it...",
];

const brailleFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function ThinkingIndicator() {
  const [frame, setFrame] = useState(0);
  const [text] = useState(
    () => thinkingTexts[Math.floor(Math.random() * thinkingTexts.length)],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % brailleFrames.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-1.5 py-1 text-sm text-foreground-secondary">
      <span className="font-mono">{brailleFrames[frame]}</span>
      <span>{text}</span>
    </div>
  );
}

function MessageGroup({
  role,
  messages,
}: {
  role: string;
  messages: Array<{
    id: string;
    content: string;
    toolCalls: string | null;
  }>;
}) {
  const isAssistant = role === "assistant";

  return (
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
          <div
            key={msg.id}
            className={cn(
              isAssistant
                ? "px-1"
                : "rounded-lg bg-muted/50 border border-input px-3 py-2",
            )}
          >
            {isThinking && <ThinkingIndicator />}
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
  );
}

function DraftEditor({
  chatId,
  draft,
  onAccept,
  onDismiss,
}: {
  chatId: string;
  draft: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestMarkdownRef = useRef<string>(draft);
  const resolvedRef = useRef(false);

  // Track a revision counter that increments when the draft prop changes
  // externally (i.e. the new value differs from what the user last edited).
  const [externalRevision, setExternalRevision] = useState(0);

  useEffect(() => {
    if (draft !== latestMarkdownRef.current) {
      latestMarkdownRef.current = draft;
      setExternalRevision((r) => r + 1);
    }
  }, [draft]);

  const flushDraft = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (resolvedRef.current) return;
    mutate.agentChat.updateDraft({
      chatId,
      content: latestMarkdownRef.current,
    });
  }, [chatId]);

  const handleUpdate = useCallback(
    (value: JSONContent[]) => {
      const md = stringify(value);
      latestMarkdownRef.current = md;

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        if (!resolvedRef.current) {
          mutate.agentChat.updateDraft({ chatId, content: md });
        }
      }, 500);
    },
    [chatId],
  );

  useEffect(() => {
    return () => {
      flushDraft();
    };
  }, [flushDraft]);

  const handleAccept = useCallback(() => {
    flushDraft();
    resolvedRef.current = true;
    onAccept();
  }, [flushDraft, onAccept]);

  const handleDismiss = useCallback(() => {
    resolvedRef.current = true;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    onDismiss();
  }, [onDismiss]);

  return (
    <div className="shrink-0 border-b border-input p-4 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <PenLineIcon className="size-3.5" />
        <span>Draft Reply</span>
      </div>
      <div className="text-sm max-h-52 min-h-0 overflow-y-auto -mr-4">
        <EditableRichText
          key={externalRevision}
          content={draft}
          onUpdate={handleUpdate}
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={handleDismiss}>
          <XIcon className="size-3.5 mr-1" />
          Dismiss
        </Button>
        <Button size="sm" variant="primary" onClick={handleAccept}>
          <CheckIcon className="size-3.5 mr-1" />
          Accept & Send
        </Button>
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
  const isCreatingRef = useRef(false);
  const isFirstScrollRef = useRef(true);

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
    if (isCreatingRef.current) return;
    if (!agentChats || agentChats.length !== 0 || !organizationId) return;

    isCreatingRef.current = true;
    mutate.agentChat.create({ organizationId, threadId }).finally(() => {
      isCreatingRef.current = false;
    });
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
    messagesEndRef.current?.scrollIntoView({
      behavior: isFirstScrollRef.current ? "instant" : "smooth",
    });
    if (isFirstScrollRef.current) {
      isFirstScrollRef.current = false;
    }
  }, [messages, isFirstScrollRef]);

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

  const hasDraft = agentChat?.draftStatus === "active" && agentChat?.draft;

  const handleAcceptDraft = useCallback(async () => {
    if (!agentChat) return;
    await mutate.agentChat.acceptDraft({ chatId: agentChat.id });
    captureThreadEvent("thread:si_draft_accepted");
  }, [agentChat, captureThreadEvent]);

  const handleDismissDraft = useCallback(async () => {
    if (!agentChat) return;
    await mutate.agentChat.dismissDraft({ chatId: agentChat.id });
    captureThreadEvent("thread:si_draft_dismissed");
  }, [agentChat, captureThreadEvent]);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col",
        hasDraft ? "max-h-[512px]" : "max-h-[384px]",
        className,
      )}
    >
      {hasDraft && agentChat && (
        <DraftEditor
          chatId={agentChat.id}
          draft={agentChat.draft!}
          onAccept={handleAcceptDraft}
          onDismiss={handleDismissDraft}
        />
      )}
      {messageGroups.length > 0 ? (
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto p-4 space-y-4",
            hasDraft && "max-h-[256px]",
          )}
        >
          {messageGroups.map((group, i) => (
            <MessageGroup
              // biome-ignore lint/suspicious/noArrayIndexKey: it's ok
              key={`group-${i}`}
              role={group.role}
              messages={group.messages}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
      ) : null}
      <KeybindIsolation
        className={cn(
          "shrink-0 grow-0 p-3 flex gap-2",
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
