import { google } from "@ai-sdk/google";
import { parse } from "@workspace/utils/md-tiptap";
import { jsonContentToPlainText, safeParseJSON } from "@workspace/utils/tiptap";
import { stepCountIs, streamText } from "ai";
import { ulid } from "ulid";
import { z } from "zod";
import { authorize } from "../../lib/authorize";
import { searchDocumentation, searchMessages } from "../../lib/search/qdrant";
import { privateRoute } from "../factories";
import { schema } from "../schema";
import {
  type AgentChatToolImplementations,
  buildAgentChatTools,
  buildSystemPrompt,
  formatSuggestionsContext,
  formatThreadMetadata,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from "./agent-chat-core";

export const agentChatRoute = privateRoute
  .collectionRoute(schema.agentChat, {
    read: ({ ctx }) => {
      if (ctx?.internalApiKey) return true;
      if (!ctx?.session) return false;

      return {
        organization: {
          organizationUsers: {
            userId: ctx.session.userId,
            enabled: true,
          },
        },
      };
    },
    insert: () => false,
    update: {
      preMutation: () => false,
      postMutation: () => false,
    },
  })
  .withProcedures(({ mutation }) => ({
    create: mutation(
      z.object({
        organizationId: z.string(),
        threadId: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      if (!req.context?.session?.userId) {
        throw new Error("UNAUTHORIZED");
      }

      authorize(req.context, {
        organizationId: req.input.organizationId,
      });

      const orgUser = await db.organizationUser
        .first({
          organizationId: req.input.organizationId,
          userId: req.context.session.userId,
          enabled: true,
        })
        .get();

      if (!orgUser) {
        throw new Error("UNAUTHORIZED");
      }

      const thread = await db.thread
        .first({
          id: req.input.threadId,
          organizationId: req.input.organizationId,
        })
        .get();

      if (!thread) {
        throw new Error("UNAUTHORIZED");
      }

      const id = ulid().toLowerCase();

      const agentChat = await db.agentChat.insert({
        id,
        organizationId: req.input.organizationId,
        userId: req.context.session.userId,
        threadId: req.input.threadId,
        createdAt: new Date(),
        draft: null,
      });

      return agentChat;
    }),

    sendMessage: mutation(
      z.object({
        chatId: z.string(),
        message: z.string().min(1),
      }),
    ).handler(async ({ req, db }) => {
      if (!req.context?.session?.userId) {
        throw new Error("UNAUTHORIZED");
      }

      const agentChat = await db.agentChat.one(req.input.chatId).get();
      if (!agentChat) {
        throw new Error("CHAT_NOT_FOUND");
      }

      // Enforce chat ownership
      if (agentChat.userId !== req.context.session.userId) {
        throw new Error("UNAUTHORIZED");
      }

      authorize(req.context, {
        organizationId: agentChat.organizationId,
      });

      const orgUser = await db.organizationUser
        .first({
          organizationId: agentChat.organizationId,
          userId: req.context.session.userId,
          enabled: true,
        })
        .get();

      if (!orgUser) {
        throw new Error("UNAUTHORIZED");
      }

      // Insert user message
      await db.agentChatMessage.insert({
        id: ulid().toLowerCase(),
        agentChatId: req.input.chatId,
        role: "user",
        content: req.input.message,
        toolCalls: null,
        createdAt: new Date(),
      });

      // Create assistant message placeholder
      const assistantMessageId = ulid().toLowerCase();
      await db.agentChatMessage.insert({
        id: assistantMessageId,
        agentChatId: req.input.chatId,
        role: "assistant",
        content: "",
        toolCalls: null,
        createdAt: new Date(),
      });

      // Fetch thread context
      const thread = await db.thread.one(agentChat.threadId).get();

      const threadMessages = (
        await db.message.where({ threadId: agentChat.threadId }).get()
      ).sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

      // Fetch authors (for messages and thread creator)
      const allAuthorIds = [
        ...new Set([
          ...threadMessages.map((m) => m.authorId),
          ...(thread?.authorId ? [thread.authorId] : []),
        ]),
      ];
      const authors = new Map<string, string>();
      await Promise.all(
        allAuthorIds.map(async (authorId) => {
          const author = await db.author.one(authorId).get();
          if (author) authors.set(authorId, author.name);
        }),
      );

      // Fetch assignee
      let assigneeName: string | null = null;
      if (thread?.assignedUserId) {
        const assignee = await db.user.one(thread.assignedUserId).get();
        if (assignee) assigneeName = assignee.name;
      }

      // Fetch labels
      const threadLabels = await db.threadLabel
        .where({ threadId: agentChat.threadId, enabled: true })
        .get();
      const labelNames: string[] = [];
      const labelResults = await Promise.all(
        threadLabels.map(async (tl) => {
          const label = await db.label.one(tl.labelId).get();
          return label?.enabled ? label.name : null;
        }),
      );
      labelNames.push(
        ...labelResults.filter((name): name is string => name !== null),
      );

      // Fetch active suggestions for this thread
      const allSuggestions = await db.suggestion
        .where({
          entityId: agentChat.threadId,
          organizationId: agentChat.organizationId,
          active: true,
        })
        .get();

      // Related threads suggestions
      const relatedThreadSuggestions = allSuggestions.filter(
        (s) => s.type === "related_threads" && s.relatedEntityId,
      );
      const relatedThreadsContext: string[] = [];
      await Promise.all(
        relatedThreadSuggestions.map(async (s) => {
          if (!s.relatedEntityId) return;
          const relatedThread = await db.thread
            .first({
              id: s.relatedEntityId,
              organizationId: agentChat.organizationId,
              deletedAt: null,
            })
            .get();
          if (!relatedThread) return;
          let score: number | null = null;
          try {
            const parsed = s.resultsStr
              ? (JSON.parse(s.resultsStr) as { score?: number })
              : null;
            score = parsed?.score ?? null;
          } catch {
            // Ignore malformed suggestion payload
          }
          const author = relatedThread.authorId
            ? await db.author.one(relatedThread.authorId).get()
            : null;
          relatedThreadsContext.push(
            `- "${relatedThread.name}" (_id: ${relatedThread.id}, by ${author?.name ?? "Unknown"}${score ? `, similarity: ${Math.round(score * 100)}%` : ""})`,
          );
        }),
      );

      // Label suggestions
      const labelSuggestions = allSuggestions.filter(
        (s) => s.type === "label" && s.relatedEntityId,
      );
      const suggestedLabelNames: string[] = [];
      await Promise.all(
        labelSuggestions.map(async (s) => {
          if (!s.relatedEntityId) return;
          const label = await db.label.one(s.relatedEntityId).get();
          if (label?.enabled) suggestedLabelNames.push(label.name);
        }),
      );

      // Status suggestion
      const statusSuggestion = allSuggestions.find(
        (s) => s.type === "status" && s.resultsStr,
      );
      let suggestedStatus: {
        status: string;
        confidence: number | null;
        reasoning: string | null;
      } | null = null;
      if (statusSuggestion?.resultsStr) {
        try {
          const statusResult = JSON.parse(statusSuggestion.resultsStr) as {
            suggestedStatus?: number;
          };
          let meta: { confidence?: number; reasoning?: string } | null = null;
          try {
            meta = statusSuggestion.metadataStr
              ? (JSON.parse(statusSuggestion.metadataStr) as {
                  confidence?: number;
                  reasoning?: string;
                })
              : null;
          } catch {
            // Ignore malformed metadata
          }
          const statusNum = statusResult.suggestedStatus;
          if (statusNum !== undefined) {
            const statusMap: Record<number, string> = {
              0: "Open",
              1: "In Progress",
              2: "Resolved",
              3: "Closed",
              4: "Duplicated",
            };
            suggestedStatus = {
              status: statusMap[statusNum] ?? "Unknown",
              confidence: meta?.confidence ?? null,
              reasoning: meta?.reasoning ?? null,
            };
          }
        } catch {
          // Ignore malformed status suggestion payload
        }
      }

      // Duplicate suggestion
      const duplicateSuggestion = allSuggestions.find(
        (s) => s.type === "duplicate" && s.relatedEntityId,
      );
      let suggestedDuplicate: {
        _id: string;
        threadName: string;
        confidence: string | null;
        reason: string | null;
      } | null = null;
      if (duplicateSuggestion?.relatedEntityId) {
        const dupThread = await db.thread
          .first({
            id: duplicateSuggestion.relatedEntityId,
            organizationId: agentChat.organizationId,
            deletedAt: null,
          })
          .get();
        if (dupThread) {
          let dupResults: { confidence?: string; reason?: string } | null =
            null;
          try {
            dupResults = duplicateSuggestion.resultsStr
              ? (JSON.parse(duplicateSuggestion.resultsStr) as {
                  confidence?: string;
                  reason?: string;
                })
              : null;
          } catch {
            // Ignore malformed duplicate suggestion payload
          }
          suggestedDuplicate = {
            _id: dupThread.id,
            threadName: dupThread.name,
            confidence: dupResults?.confidence ?? null,
            reason: dupResults?.reason ?? null,
          };
        }
      }

      const statusLabels = STATUS_LABELS;
      const priorityLabels = PRIORITY_LABELS;

      const threadContext = threadMessages
        .map((m) => `[${authors.get(m.authorId) ?? "Unknown"}]: ${m.content}`)
        .join("\n");

      // Fetch conversation history (all messages except the empty assistant one)
      const chatMessages = (
        await db.agentChatMessage
          .where({ agentChatId: req.input.chatId })
          .get()
      )
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )
        .filter((m) => m.id !== assistantMessageId);

      const conversationHistory = chatMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const threadMetadata = formatThreadMetadata({
        name: thread?.name ?? "Unknown thread",
        author: thread?.authorId
          ? (authors.get(thread.authorId) ?? "Unknown")
          : "Unknown",
        createdAt: thread?.createdAt
          ? new Date(thread.createdAt).toISOString()
          : "Unknown",
        status: statusLabels[thread?.status ?? 0] ?? "Unknown",
        priority: priorityLabels[thread?.priority ?? 0] ?? "None",
        assignee: assigneeName,
        labels: labelNames,
        externalOrigin: thread?.externalOrigin,
      });

      const suggestionsContext = formatSuggestionsContext({
        relatedThreads:
          relatedThreadsContext.length > 0 ? relatedThreadsContext : undefined,
        suggestedDuplicate,
        suggestedStatus,
        suggestedLabels:
          suggestedLabelNames.length > 0 ? suggestedLabelNames : undefined,
      });

      // Fetch organization for custom instructions
      const org = await db.organization.one(agentChat.organizationId).get();

      // Fetch current user name for personalization
      const currentUser = await db.user
        .one(req.context.session.userId)
        .get();

      const systemPrompt = buildSystemPrompt({
        threadMetadata,
        threadContext,
        suggestionsContext,
        customInstructions: org?.customInstructions,
        currentUserName: currentUser?.name ?? null,
      });

      // Stream in background — don't await, let the mutation return immediately
      // so the client sees the user message + empty assistant message right away.
      (async () => {
        let accumulated = "";
        let chunkCount = 0;
        const toolCallsArr: Array<{
          name: string;
          args: unknown;
          status: "calling" | "complete";
          result?: unknown;
        }> = [];
        try {
          console.log(
            `[agent-chat] Starting streamText for chat=${req.input.chatId} assistantMsg=${assistantMessageId}`,
          );
          console.log(
            `[agent-chat] Conversation history: ${conversationHistory.length} messages, thread context: ${threadContext.length} chars`,
          );

          const organizationId = agentChat.organizationId;

          const toolImplementations: AgentChatToolImplementations = {
            searchDocumentation: async ({ query }) => {
              console.log(
                `[agent-chat] Tool call: searchDocumentation query="${query}"`,
              );
              const results = await searchDocumentation({
                query,
                organizationId,
              });
              console.log(
                `[agent-chat] Documentation search returned ${results.length} results`,
              );
              return results.map((r) => ({
                title: r.pageTitle,
                url: r.pageUrl,
                content: r.chunkText,
                section: r.headingHierarchy.join(" > "),
              }));
            },
            getDraft: async () => {
              const currentChat = await db.agentChat.one(agentChat.id).get();
              if (currentChat?.draft && currentChat.draftStatus === "active") {
                return { hasDraft: true, content: currentChat.draft };
              }
              return { hasDraft: false, content: null };
            },
            setDraft: async ({ content }) => {
              console.log(
                `[agent-chat] Tool call: setDraft content length=${content.length}`,
              );
              await db.agentChat.update(agentChat.id, {
                draft: content,
                draftStatus: "active",
              });
              return { success: true };
            },
            searchThreads: async ({ query }) => {
              console.log(
                `[agent-chat] Tool call: searchThreads query="${query}"`,
              );
              const results = await searchMessages({
                query,
                organizationId,
                limit: 15,
              });

              // Deduplicate by threadId, keeping highest score per thread
              const threadMap = new Map<
                string,
                { messageId: string; threadId: string; score: number }
              >();
              for (const r of results) {
                if (r.threadId === agentChat.threadId) continue;
                const existing = threadMap.get(r.threadId);
                if (!existing || r.score > existing.score) {
                  threadMap.set(r.threadId, r);
                }
              }

              const uniqueResults = [...threadMap.values()]
                .sort((a, b) => b.score - a.score)
                .slice(0, 8);

              const enriched = await Promise.all(
                uniqueResults.map(async (r) => {
                  const [thread, message] = await Promise.all([
                    db.thread
                      .first({
                        id: r.threadId,
                        organizationId,
                        deletedAt: null,
                      })
                      .get(),
                    db.message.one(r.messageId).get(),
                  ]);

                  if (!thread) {
                    return null;
                  }

                  const author = thread.authorId
                    ? await db.author.one(thread.authorId).get()
                    : null;

                  let snippet = "";
                  if (message) {
                    snippet = jsonContentToPlainText(
                      safeParseJSON(message.content),
                    );
                    if (snippet.length > 300) {
                      snippet = `${snippet.slice(0, 300)}...`;
                    }
                  }

                  return {
                    _id: r.threadId,
                    name: thread.name,
                    status: statusLabels[thread.status ?? 0] ?? "Unknown",
                    priority: priorityLabels[thread.priority ?? 0] ?? "None",
                    author: author?.name ?? "Unknown",
                    createdAt: thread.createdAt
                      ? new Date(thread.createdAt).toISOString()
                      : "Unknown",
                    matchingMessageSnippet: snippet,
                    score: r.score,
                  };
                }),
              );

              const filtered = enriched.filter(
                (item): item is NonNullable<typeof item> => item !== null,
              );
              console.log(
                `[agent-chat] searchThreads returned ${filtered.length} threads`,
              );
              return filtered;
            },
            getThread: async ({ threadId }) => {
              console.log(
                `[agent-chat] Tool call: getThread threadId="${threadId}"`,
              );
              const thread = await db.thread
                .first({
                  id: threadId,
                  organizationId,
                  deletedAt: null,
                })
                .get();

              if (!thread) {
                return { error: "Thread not found or access denied" };
              }

              const allMessages = (
                await db.message.where({ threadId }).get()
              ).sort(
                (a, b) =>
                  new Date(a.createdAt).getTime() -
                  new Date(b.createdAt).getTime(),
              );

              const totalCount = allMessages.length;
              const messages = allMessages.slice(-50);

              const authorIds = [
                ...new Set([
                  ...messages.map((m) => m.authorId),
                  ...(thread.authorId ? [thread.authorId] : []),
                ]),
              ];
              const authorsMap = new Map<string, string>();
              await Promise.all(
                authorIds.map(async (id) => {
                  const author = await db.author.one(id).get();
                  if (author) authorsMap.set(id, author.name);
                }),
              );

              let threadAssignee: string | null = null;
              if (thread.assignedUserId) {
                const assignee = await db.user.one(thread.assignedUserId).get();
                if (assignee) threadAssignee = assignee.name;
              }

              const threadLabelsData = await db.threadLabel
                .where({ threadId, enabled: true })
                .get();
              const threadLabelNames: string[] = [];
              const labelResults = await Promise.all(
                threadLabelsData.map(async (tl) => {
                  const label = await db.label.one(tl.labelId).get();
                  return label?.enabled ? label.name : null;
                }),
              );
              threadLabelNames.push(
                ...labelResults.filter((name): name is string => name !== null),
              );

              const formattedMessages = messages.map((m) => {
                let content = jsonContentToPlainText(safeParseJSON(m.content));
                if (content.length > 1000) {
                  content = `${content.slice(0, 1000)}...`;
                }
                return {
                  author: authorsMap.get(m.authorId) ?? "Unknown",
                  content,
                  createdAt: new Date(m.createdAt).toISOString(),
                };
              });

              return {
                _id: threadId,
                name: thread.name,
                status: statusLabels[thread.status ?? 0] ?? "Unknown",
                priority: priorityLabels[thread.priority ?? 0] ?? "None",
                author: authorsMap.get(thread.authorId ?? "") ?? "Unknown",
                assignee: threadAssignee,
                labels: threadLabelNames,
                createdAt: thread.createdAt
                  ? new Date(thread.createdAt).toISOString()
                  : "Unknown",
                externalOrigin: thread.externalOrigin ?? null,
                messageCount: totalCount,
                ...(totalCount > 50
                  ? {
                      note: `Showing last 50 of ${totalCount} messages`,
                    }
                  : {}),
                messages: formattedMessages,
              };
            },
            listThreads: async ({ status, priority, limit = 10 }) => {
              console.log(
                `[agent-chat] Tool call: listThreads status=${status} priority=${priority} limit=${limit}`,
              );

              const statusValues: Record<string, number> = {
                Open: 0,
                "In Progress": 1,
                Resolved: 2,
                Closed: 3,
              };
              const priorityValues: Record<string, number> = {
                None: 0,
                Low: 1,
                Medium: 2,
                High: 3,
                Urgent: 4,
              };

              // biome-ignore lint/suspicious/noExplicitAny: query builder type
              let query: any = db.thread.where({
                organizationId,
                deletedAt: null,
              });

              if (status !== undefined) {
                query = query.where({
                  status: statusValues[status],
                });
              }
              if (priority !== undefined) {
                query = query.where({
                  priority: priorityValues[priority],
                });
              }

              const threads = await query
                .orderBy("id", "desc")
                .limit(limit)
                .get();

              const results = await Promise.all(
                threads.map(
                  async (t: {
                    id: string;
                    name: string;
                    status: number;
                    priority: number;
                    authorId: string | null;
                    assignedUserId: string | null;
                    createdAt: Date | string;
                    externalOrigin: string | null;
                  }) => {
                    const [author, assignee] = await Promise.all([
                      t.authorId ? db.author.one(t.authorId).get() : null,
                      t.assignedUserId
                        ? db.user.one(t.assignedUserId).get()
                        : null,
                    ]);

                    return {
                      _id: t.id,
                      name: t.name,
                      status: statusLabels[t.status ?? 0] ?? "Unknown",
                      priority: priorityLabels[t.priority ?? 0] ?? "None",
                      author: author?.name ?? "Unknown",
                      assignee: assignee?.name ?? null,
                      createdAt: new Date(t.createdAt).toISOString(),
                      externalOrigin: t.externalOrigin ?? null,
                    };
                  },
                ),
              );

              console.log(
                `[agent-chat] listThreads returned ${results.length} threads`,
              );
              return results;
            },
          };

          const result = streamText({
            model: google("gemini-2.5-flash"),
            system: systemPrompt,
            messages: conversationHistory,
            tools: buildAgentChatTools(toolImplementations),
            stopWhen: stepCountIs(12),
            providerOptions: {
              google: { thinkingConfig: { thinkingBudget: 1024 } },
            },
          });

          console.log("[agent-chat] streamText() called, awaiting chunks...");

          for await (const part of result.fullStream) {
            if (part.type === "text-delta") {
              chunkCount++;
              accumulated += part.text;

              if (chunkCount <= 3 || chunkCount % 10 === 0) {
                console.log(
                  `[agent-chat] Chunk #${chunkCount}: +${part.text.length} chars, total=${accumulated.length} chars`,
                );
              }

              await db.agentChatMessage.update(assistantMessageId, {
                content: accumulated,
              });
            } else if (part.type === "tool-call") {
              const inputMeta =
                part.toolName === "setDraft"
                  ? `contentLength=${typeof (part.input as { content?: string })?.content === "string" ? (part.input as { content: string }).content.length : 0}`
                  : `hasInput=${part.input != null}`;
              console.log(
                `[agent-chat] Tool call: ${part.toolName} ${inputMeta}`,
              );
              toolCallsArr.push({
                name: part.toolName,
                args: part.input,
                status: "calling",
              });
              await db.agentChatMessage.update(assistantMessageId, {
                toolCalls: JSON.stringify(toolCallsArr),
              });
            } else if (part.type === "tool-result") {
              console.log(`[agent-chat] Tool result for: ${part.toolName}`);
              const idx = toolCallsArr.findIndex(
                (tc) => tc.name === part.toolName && tc.status === "calling",
              );
              if (idx !== -1) {
                toolCallsArr[idx].status = "complete";
                toolCallsArr[idx].result = part.output;
              }
              await db.agentChatMessage.update(assistantMessageId, {
                toolCalls: JSON.stringify(toolCallsArr),
              });
            }
          }

          console.log(
            `[agent-chat] Stream complete: ${chunkCount} chunks, ${accumulated.length} total chars`,
          );

          // Signal stream completion
          await db.agentChatMessage.update(assistantMessageId, {
            toolCalls: JSON.stringify({ calls: toolCallsArr, done: true }),
          });
        } catch (error) {
          console.error(
            `[agent-chat] Streaming error after ${chunkCount} chunks:`,
            error,
          );
          await db.agentChatMessage.update(assistantMessageId, {
            content: accumulated || "[Error generating response]",
            toolCalls: JSON.stringify({ calls: toolCallsArr, done: true }),
          });
        }
      })();

      return { assistantMessageId };
    }),

    acceptDraft: mutation(
      z.object({
        chatId: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      if (!req.context?.session?.userId) {
        throw new Error("UNAUTHORIZED");
      }

      const chat = await db.agentChat.one(req.input.chatId).get();
      if (!chat) {
        throw new Error("CHAT_NOT_FOUND");
      }

      // Enforce chat ownership
      if (chat.userId !== req.context.session.userId) {
        throw new Error("UNAUTHORIZED");
      }

      authorize(req.context, {
        organizationId: chat.organizationId,
      });

      const orgUser = await db.organizationUser
        .first({
          organizationId: chat.organizationId,
          userId: req.context.session.userId,
          enabled: true,
        })
        .get();

      if (!orgUser) {
        throw new Error("UNAUTHORIZED");
      }

      if (!chat.draft || chat.draftStatus !== "active") {
        throw new Error("NO_ACTIVE_DRAFT");
      }

      // TODO: Move back inside transaction once live-state syncs trx.insert to clients
      // See: https://github.com/pedroscosta/live-state/issues/135
      // Find or create author for the current user (outside transaction
      // so live-state properly syncs the author record to clients)
      const existingAuthor = await db.author
        .first({
          userId: req.context.session.userId,
          organizationId: chat.organizationId,
        })
        .get();

      let authorId = existingAuthor?.id;

      if (!authorId) {
        const user = await db.user.one(req.context.session.userId).get();
        authorId = ulid().toLowerCase();
        await db.author.insert({
          id: authorId,
          userId: req.context.session.userId,
          metaId: null,
          name: user?.name ?? "Unknown User",
          organizationId: chat.organizationId,
        });
      }

      // Use transaction to prevent concurrent double-accepts
      await db.transaction(async ({ trx }) => {
        // Atomically claim the draft
        const currentChat = await trx.agentChat.one(req.input.chatId).get();
        if (!currentChat?.draft || currentChat.draftStatus !== "active") {
          throw new Error("NO_ACTIVE_DRAFT");
        }

        // Convert markdown draft to tiptap JSONContent
        const content = JSON.stringify(parse(currentChat.draft));

        await trx.message.insert({
          id: ulid().toLowerCase(),
          authorId,
          content,
          threadId: chat.threadId,
          createdAt: new Date(),
          origin: null,
          externalMessageId: null,
        });

        // Clear the draft
        await trx.agentChat.update(chat.id, {
          draft: null,
          draftStatus: "accepted",
        });
      });

      return { success: true };
    }),

    dismissDraft: mutation(
      z.object({
        chatId: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      if (!req.context?.session?.userId) {
        throw new Error("UNAUTHORIZED");
      }

      const chat = await db.agentChat.one(req.input.chatId).get();
      if (!chat) {
        throw new Error("CHAT_NOT_FOUND");
      }

      // Enforce chat ownership
      if (chat.userId !== req.context.session.userId) {
        throw new Error("UNAUTHORIZED");
      }

      authorize(req.context, {
        organizationId: chat.organizationId,
      });

      const orgUser = await db.organizationUser
        .first({
          organizationId: chat.organizationId,
          userId: req.context.session.userId,
          enabled: true,
        })
        .get();

      if (!orgUser) {
        throw new Error("UNAUTHORIZED");
      }

      await db.agentChat.update(chat.id, {
        draft: null,
        draftStatus: "dismissed",
      });

      return { success: true };
    }),

    updateDraft: mutation(
      z.object({
        chatId: z.string(),
        content: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      if (!req.context?.session?.userId) {
        throw new Error("UNAUTHORIZED");
      }

      const chat = await db.agentChat.one(req.input.chatId).get();
      if (!chat) {
        throw new Error("CHAT_NOT_FOUND");
      }

      if (chat.userId !== req.context.session.userId) {
        throw new Error("UNAUTHORIZED");
      }

      authorize(req.context, {
        organizationId: chat.organizationId,
      });

      const orgUser = await db.organizationUser
        .first({
          organizationId: chat.organizationId,
          userId: req.context.session.userId,
          enabled: true,
        })
        .get();

      if (!orgUser) {
        throw new Error("UNAUTHORIZED");
      }

      if (chat.draftStatus !== "active") {
        throw new Error("NO_ACTIVE_DRAFT");
      }

      await db.agentChat.update(chat.id, {
        draft: req.input.content,
      });

      return { success: true };
    }),
  }));

export const agentChatMessageRoute = privateRoute.collectionRoute(
  schema.agentChatMessage,
  {
    read: ({ ctx }) => {
      if (ctx?.internalApiKey) return true;
      if (!ctx?.session) return false;

      return {
        agentChat: {
          organization: {
            organizationUsers: {
              userId: ctx.session.userId,
              enabled: true,
            },
          },
        },
      };
    },
    insert: () => false,
    update: {
      preMutation: () => false,
      postMutation: () => false,
    },
  },
);
