import { useLiveQuery } from "@live-state/sync/client";
import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai/react";
import { Bot, Send, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { mutate, query } from "~/lib/live-state";

export const Route = createFileRoute(
  "/app/_workspace/_main/playground/" as any,
)({
  component: PlaygroundPage,
});

type ChatMessage = {
  id: string;
  agentChatId: string;
  role: string;
  content: string;
  createdAt: Date;
};

function PlaygroundPage() {
  const currentOrg = useAtomValue(activeOrganizationAtom);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const threads = useLiveQuery(
    query.thread.where({
      organizationId: currentOrg?.id,
      deletedAt: null,
    }),
  );

  const chatMessages = useLiveQuery(
    query.agentChatMessage
      .where({ agentChatId: chatId ?? "__none__" })
      .orderBy("createdAt", "asc"),
  ) as ChatMessage[] | undefined;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSelectThread = useCallback(
    async (threadId: string) => {
      if (!currentOrg) return;
      setSelectedThreadId(threadId);
      setChatId(null);

      const result = await mutate.agentChat.create({
        organizationId: currentOrg.id,
        threadId,
      });

      if (result?.id) {
        setChatId(result.id);
      }
    },
    [currentOrg],
  );

  const handleSend = useCallback(async () => {
    if (!chatId || !input.trim() || isSending) return;

    const message = input.trim();
    setInput("");
    setIsSending(true);

    try {
      await mutate.agentChat.sendMessage({
        chatId,
        message,
      });
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsSending(false);
    }
  }, [chatId, input, isSending]);

  const selectedThread = threads?.find(
    (t: { id: string }) => t.id === selectedThreadId,
  );

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Agent Playground</h1>
        <p className="text-sm text-foreground-secondary">
          Pick a thread and chat with an AI agent about it.
        </p>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Thread picker sidebar */}
        <div className="w-72 border-r flex flex-col min-h-0">
          <div className="px-4 py-3 border-b text-sm font-medium text-foreground-secondary">
            Threads
          </div>
          <div className="flex-1 overflow-y-auto">
            {(threads as any[])?.map((thread: { id: string; name: string }) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => handleSelectThread(thread.id)}
                className={`w-full text-left px-4 py-2.5 text-sm border-b hover:bg-foreground-tertiary/10 transition-colors ${
                  selectedThreadId === thread.id
                    ? "bg-foreground-tertiary/15 font-medium"
                    : ""
                }`}
              >
                <div className="truncate">{thread.name}</div>
              </button>
            ))}
            {(!threads || (threads as any[]).length === 0) && (
              <div className="px-4 py-8 text-sm text-foreground-secondary text-center">
                No threads found
              </div>
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-h-0">
          {!selectedThreadId ? (
            <div className="flex-1 flex items-center justify-center text-foreground-secondary">
              Select a thread to start chatting
            </div>
          ) : !chatId ? (
            <div className="flex-1 flex items-center justify-center text-foreground-secondary">
              Loading chat session...
            </div>
          ) : (
            <>
              {/* Thread info */}
              {selectedThread && (
                <div className="px-6 py-3 border-b text-sm">
                  <span className="font-medium">
                    {(selectedThread as any).name}
                  </span>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {chatMessages?.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === "assistant" ? "" : "justify-end"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="shrink-0 w-7 h-7 rounded-full bg-foreground-tertiary/20 flex items-center justify-center">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-foreground-tertiary/10"
                      }`}
                    >
                      {msg.content || (
                        <span className="text-foreground-secondary italic">
                          Thinking...
                        </span>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="shrink-0 w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
                        <User className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                ))}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t px-6 py-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Ask about this thread..."
                    disabled={isSending}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={isSending || !input.trim()}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <Send className="w-4 h-4" />
                    Send
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
