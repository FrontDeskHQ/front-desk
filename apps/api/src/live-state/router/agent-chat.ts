import { google } from "@ai-sdk/google";
import { parse } from "@workspace/utils/md-tiptap";
import { stepCountIs, streamText, tool } from "ai";
import { ulid } from "ulid";
import { z } from "zod";
import {
  jsonContentToPlainText,
  safeParseJSON,
} from "@workspace/utils/tiptap";
import {
  searchDocumentation,
  searchMessages,
} from "../../lib/search/qdrant";
import { privateRoute } from "../factories";
import { schema } from "../schema";

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
  .withMutations(({ mutation }) => ({
    create: mutation(
      z.object({
        organizationId: z.string(),
        threadId: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      if (!req.context?.session?.userId) {
        throw new Error("UNAUTHORIZED");
      }

      const orgUser = Object.values(
        await db.find(schema.organizationUser, {
          where: {
            organizationId: req.input.organizationId,
            userId: req.context.session.userId,
            enabled: true,
          },
        }),
      )[0];

      if (!orgUser) {
        throw new Error("UNAUTHORIZED");
      }

      const thread = Object.values(
        await db.find(schema.thread, {
          where: {
            id: req.input.threadId,
            organizationId: req.input.organizationId,
          },
        }),
      )[0];

      if (!thread) {
        throw new Error("UNAUTHORIZED");
      }

      const id = ulid().toLowerCase();

      const agentChat = await db.insert(schema.agentChat, {
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

      const agentChat = await db.findOne(schema.agentChat, req.input.chatId);
      if (!agentChat) {
        throw new Error("CHAT_NOT_FOUND");
      }

      // Enforce chat ownership
      if (agentChat.userId !== req.context.session.userId) {
        throw new Error("UNAUTHORIZED");
      }

      // Verify org membership
      const orgUser = Object.values(
        await db.find(schema.organizationUser, {
          where: {
            organizationId: agentChat.organizationId,
            userId: req.context.session.userId,
            enabled: true,
          },
        }),
      )[0];

      if (!orgUser) {
        throw new Error("UNAUTHORIZED");
      }

      // Insert user message
      await db.insert(schema.agentChatMessage, {
        id: ulid().toLowerCase(),
        agentChatId: req.input.chatId,
        role: "user",
        content: req.input.message,
        toolCalls: null,
        createdAt: new Date(),
      });

      // Create assistant message placeholder
      const assistantMessageId = ulid().toLowerCase();
      await db.insert(schema.agentChatMessage, {
        id: assistantMessageId,
        agentChatId: req.input.chatId,
        role: "assistant",
        content: "",
        toolCalls: null,
        createdAt: new Date(),
      });

      // Fetch thread context
      const thread = await db.findOne(schema.thread, agentChat.threadId);

      const threadMessages = Object.values(
        await db.find(schema.message, {
          where: { threadId: agentChat.threadId },
        }),
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
          const author = await db.findOne(schema.author, authorId);
          if (author) authors.set(authorId, author.name);
        }),
      );

      // Fetch assignee
      let assigneeName: string | null = null;
      if (thread?.assignedUserId) {
        const assignee = await db.findOne(schema.user, thread.assignedUserId);
        if (assignee) assigneeName = assignee.name;
      }

      // Fetch labels
      const threadLabels = Object.values(
        await db.find(schema.threadLabel, {
          where: { threadId: agentChat.threadId, enabled: true },
        }),
      );
      const labelNames: string[] = [];
      const labelResults = await Promise.all(
        threadLabels.map(async (tl) => {
          const label = await db.findOne(schema.label, tl.labelId);
          return label?.enabled ? label.name : null;
        }),
      );
      labelNames.push(...labelResults.filter((name): name is string => name !== null));

      // Fetch active suggestions for this thread
      const allSuggestions = Object.values(
        await db.find(schema.suggestion, {
          where: {
            entityId: agentChat.threadId,
            organizationId: agentChat.organizationId,
            active: true,
          },
        }),
      );

      // Related threads suggestions
      const relatedThreadSuggestions = allSuggestions.filter(
        (s) => s.type === "related_threads" && s.relatedEntityId,
      );
      const relatedThreadsContext: string[] = [];
      await Promise.all(
        relatedThreadSuggestions.map(async (s) => {
          const relatedThread = Object.values(
            await db.find(schema.thread, {
              where: {
                id: s.relatedEntityId!,
                organizationId: agentChat.organizationId,
                deletedAt: null,
              },
            }),
          )[0];
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
            ? await db.findOne(schema.author, relatedThread.authorId)
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
          const label = await db.findOne(schema.label, s.relatedEntityId!);
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
        const dupThread = Object.values(
          await db.find(schema.thread, {
            where: {
              id: duplicateSuggestion.relatedEntityId,
              organizationId: agentChat.organizationId,
              deletedAt: null,
            },
          }),
        )[0];
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

      // Map status number to label
      const statusLabels: Record<number, string> = {
        0: "Open",
        1: "In Progress",
        2: "Resolved",
        3: "Closed",
      };
      const priorityLabels: Record<number, string> = {
        0: "None",
        1: "Low",
        2: "Medium",
        3: "High",
        4: "Urgent",
      };

      const threadContext = threadMessages
        .map((m) => `[${authors.get(m.authorId) ?? "Unknown"}]: ${m.content}`)
        .join("\n");

      // Fetch conversation history (all messages except the empty assistant one)
      const chatMessages = Object.values(
        await db.find(schema.agentChatMessage, {
          where: { agentChatId: req.input.chatId },
        }),
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

      const threadMetadata = [
        `Title: "${thread?.name ?? "Unknown thread"}"`,
        `Created by: ${thread?.authorId ? (authors.get(thread.authorId) ?? "Unknown") : "Unknown"}`,
        `Created at: ${thread?.createdAt ? new Date(thread.createdAt).toISOString() : "Unknown"}`,
        `Status: ${statusLabels[thread?.status ?? 0] ?? "Unknown"}`,
        `Priority: ${priorityLabels[thread?.priority ?? 0] ?? "None"}`,
        `Assignee: ${assigneeName ?? "Unassigned"}`,
        labelNames.length > 0 ? `Labels: ${labelNames.join(", ")}` : null,
        thread?.externalOrigin ? `Source: ${thread.externalOrigin}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      // Build suggestions context
      const suggestionsLines: string[] = [];

      if (relatedThreadsContext.length > 0) {
        suggestionsLines.push(
          "### Related Threads",
          "These threads were identified as similar to the current thread based on content analysis. You can use the getThread tool with their _id to read their full conversation.",
          ...relatedThreadsContext,
        );
      }

      if (suggestedDuplicate) {
        suggestionsLines.push(
          "### Possible Duplicate",
          `This thread may be a duplicate of "${suggestedDuplicate.threadName}" (_id: ${suggestedDuplicate._id})${suggestedDuplicate.confidence ? `, confidence: ${suggestedDuplicate.confidence}` : ""}${suggestedDuplicate.reason ? `. Reason: ${suggestedDuplicate.reason}` : ""}`,
        );
      }

      if (suggestedStatus) {
        suggestionsLines.push(
          "### Suggested Status Change",
          `The system suggests changing status to "${suggestedStatus.status}"${suggestedStatus.reasoning ? `. Reasoning: ${suggestedStatus.reasoning}` : ""}`,
        );
      }

      if (suggestedLabelNames.length > 0) {
        suggestionsLines.push(
          "### Suggested Labels",
          `The system suggests adding these labels: ${suggestedLabelNames.join(", ")}`,
        );
      }

      const suggestionsContext =
        suggestionsLines.length > 0
          ? `\n## Suggestions & Intelligence\nThe following suggestions have been automatically generated by our analysis system for this thread.\n${suggestionsLines.join("\n")}\n`
          : "";

      // Fetch organization for custom instructions
      const org = await db.findOne(schema.organization, agentChat.organizationId);

      const systemPrompt = `You are a helpful AI assistant for a customer support team. You have access to the following support thread for context.

## Thread Details
${threadMetadata}

## Thread Messages
${threadContext}
${suggestionsContext}
You have a tool called "searchDocumentation" that lets you search the organization's documentation. Use it when the user asks questions that might be answered by documentation, or when you need to look up product details, guides, or technical information.

You also have a tool called "setDraft" that lets you draft a reply message for the support agent to send to the customer. Use it when the user asks you to draft, write, or compose a reply, or when it makes sense to propose a response to the customer. The draft will be shown to the support agent for review and editing before sending. If a draft already exists, setDraft will replace it.

You also have a tool called "getDraft" that lets you read the current draft reply. Use it when the user asks about or references their current draft, or when you need to see the draft before making modifications. The support agent may have edited the draft manually, so always use getDraft to read the latest version before updating it with setDraft.

You also have tools to explore other support threads in the organization:
- "searchThreads": Search across all support threads using a text query. Use it to find related issues, check if a problem has been reported before, or find context from past conversations.
- "getThread": Read the full details and messages of a specific thread by its ID. Use it after finding a thread via search to get the complete conversation.
- "listThreads": Browse recent support threads, optionally filtered by status or priority. Use it to get an overview of current issues or find threads with a specific status.
${org?.customInstructions ? `\n## Custom Instructions\n${org.customInstructions}\n` : ""}
Use the thread context to help answer questions about this support thread. Be concise and helpful.

IMPORTANT: NEVER include thread IDs (e.g. "01kgga046wb0bbbtec5kb3wsc2") in your responses. The "_id" fields in tool results are strictly internal — they exist only so you can pass them to other tools like getThread. When mentioning threads to the user, ALWAYS refer to them by their name/title only. If multiple threads share the same name, disambiguate using other details like author, date, or status — NEVER by ID.

IMPORTANT: Be proactive with your tools. Do NOT ask for permission before using them — just use them. If the user's request would benefit from searching documentation, looking up related threads, or drafting a reply, do it immediately. Act first, then present the results.`;

      console.log(systemPrompt);

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

          const result = streamText({
            model: google("gemini-2.0-flash"),
            system: systemPrompt,
            messages: conversationHistory,
            tools: {
              searchDocumentation: tool({
                description:
                  "Search the organization's documentation for relevant information. Use this when you need to look up product details, guides, how-to instructions, or technical information to help answer the user's question.",
                inputSchema: z.object({
                  query: z
                    .string()
                    .describe("The search query to find relevant documentation"),
                }),
                execute: async ({ query }) => {
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
              }),
              getDraft: tool({
                description:
                  "Read the current draft reply. Use this when you need to see the support agent's current draft before making changes.",
                inputSchema: z.object({}),
                execute: async () => {
                  const currentChat = await db.findOne(
                    schema.agentChat,
                    agentChat.id,
                  );
                  if (
                    currentChat?.draft &&
                    currentChat.draftStatus === "active"
                  ) {
                    return { hasDraft: true, content: currentChat.draft };
                  }
                  return { hasDraft: false, content: null };
                },
              }),
              setDraft: tool({
                description:
                  "Draft a reply message for the support agent to send to the customer. This replaces the current draft if one exists. The draft will be shown to the agent for review and editing before sending. Use markdown formatting.",
                inputSchema: z.object({
                  content: z
                    .string()
                    .describe(
                      "The markdown content of the draft reply message",
                    ),
                }),
                execute: async ({ content }) => {
                  console.log(
                    `[agent-chat] Tool call: setDraft content length=${content.length}`,
                  );
                  await db.update(schema.agentChat, agentChat.id, {
                    draft: content,
                    draftStatus: "active",
                  });
                  return { success: true };
                },
              }),
              searchThreads: tool({
                description:
                  "Search across all support threads in the organization using a text query. Use this to find related issues, check if a problem has been reported before, or find context from past conversations.",
                inputSchema: z.object({
                  query: z
                    .string()
                    .describe(
                      "The search query to find relevant support threads",
                    ),
                }),
                execute: async ({ query }) => {
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
                    if (r.threadId === agentChat.threadId) continue; // Exclude current thread
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
                        db
                          .find(schema.thread, {
                            where: {
                              id: r.threadId,
                              organizationId,
                              deletedAt: null,
                            },
                          })
                          .then((res) => Object.values(res)[0] ?? null),
                        db.findOne(schema.message, r.messageId),
                      ]);

                      if (!thread) {
                        return null;
                      }

                      const author = thread.authorId
                        ? await db.findOne(schema.author, thread.authorId)
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
                        status:
                          statusLabels[thread.status ?? 0] ?? "Unknown",
                        priority:
                          priorityLabels[thread.priority ?? 0] ?? "None",
                        author: author?.name ?? "Unknown",
                        createdAt: thread.createdAt
                          ? new Date(thread.createdAt).toISOString()
                          : "Unknown",
                        matchingMessageSnippet: snippet,
                        score: r.score,
                      };
                    }),
                  );

                  const filtered = enriched.filter(Boolean);
                  console.log(
                    `[agent-chat] searchThreads returned ${filtered.length} threads`,
                  );
                  return filtered;
                },
              }),
              getThread: tool({
                description:
                  "Read the full details and messages of a specific support thread by its ID. Use this after finding a thread via search to get the complete conversation.",
                inputSchema: z.object({
                  threadId: z
                    .string()
                    .describe("The ID of the thread to retrieve"),
                }),
                execute: async ({ threadId }) => {
                  console.log(
                    `[agent-chat] Tool call: getThread threadId="${threadId}"`,
                  );
                  const thread = Object.values(
                    await db.find(schema.thread, {
                      where: {
                        id: threadId,
                        organizationId,
                        deletedAt: null,
                      },
                    }),
                  )[0];

                  if (!thread) {
                    return { error: "Thread not found or access denied" };
                  }

                  // Fetch messages
                  const allMessages = Object.values(
                    await db.find(schema.message, {
                      where: { threadId },
                    }),
                  ).sort(
                    (a, b) =>
                      new Date(a.createdAt).getTime() -
                      new Date(b.createdAt).getTime(),
                  );

                  const totalCount = allMessages.length;
                  const messages = allMessages.slice(-50); // Last 50

                  // Fetch all authors
                  const authorIds = [
                    ...new Set([
                      ...messages.map((m) => m.authorId),
                      ...(thread.authorId ? [thread.authorId] : []),
                    ]),
                  ];
                  const authorsMap = new Map<string, string>();
                  await Promise.all(
                    authorIds.map(async (id) => {
                      const author = await db.findOne(schema.author, id);
                      if (author) authorsMap.set(id, author.name);
                    }),
                  );

                  // Fetch assignee
                  let threadAssignee: string | null = null;
                  if (thread.assignedUserId) {
                    const assignee = await db.findOne(
                      schema.user,
                      thread.assignedUserId,
                    );
                    if (assignee) threadAssignee = assignee.name;
                  }

                  // Fetch labels
                  const threadLabelsData = Object.values(
                    await db.find(schema.threadLabel, {
                      where: { threadId, enabled: true },
                    }),
                  );
                  const threadLabelNames: string[] = [];
                  const labelResults = await Promise.all(
                    threadLabelsData.map(async (tl) => {
                      const label = await db.findOne(
                        schema.label,
                        tl.labelId,
                      );
                      return label?.enabled ? label.name : null;
                    }),
                  );
                  threadLabelNames.push(
                    ...labelResults.filter(
                      (name): name is string => name !== null,
                    ),
                  );

                  const formattedMessages = messages.map((m) => {
                    let content = jsonContentToPlainText(
                      safeParseJSON(m.content),
                    );
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
                    status:
                      statusLabels[thread.status ?? 0] ?? "Unknown",
                    priority:
                      priorityLabels[thread.priority ?? 0] ?? "None",
                    author:
                      authorsMap.get(thread.authorId ?? "") ?? "Unknown",
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
              }),
              listThreads: tool({
                description:
                  "Browse recent support threads in the organization, optionally filtered by status or priority. Use this to get an overview of current issues or find threads with a specific status.",
                inputSchema: z.object({
                  status: z
                    .enum(["Open", "In Progress", "Resolved", "Closed"])
                    .optional()
                    .describe("Filter by thread status"),
                  priority: z
                    .enum(["None", "Low", "Medium", "High", "Urgent"])
                    .optional()
                    .describe("Filter by thread priority"),
                  limit: z
                    .number()
                    .min(1)
                    .max(20)
                    .default(10)
                    .describe("Number of threads to return (max 20)"),
                }),
                execute: async ({
                  status,
                  priority,
                  limit = 10,
                }) => {
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
                          t.authorId
                            ? db.findOne(schema.author, t.authorId)
                            : null,
                          t.assignedUserId
                            ? db.findOne(schema.user, t.assignedUserId)
                            : null,
                        ]);

                        return {
                          _id: t.id,
                          name: t.name,
                          status:
                            statusLabels[t.status ?? 0] ?? "Unknown",
                          priority:
                            priorityLabels[t.priority ?? 0] ?? "None",
                          author: author?.name ?? "Unknown",
                          assignee: assignee?.name ?? null,
                          createdAt: new Date(
                            t.createdAt,
                          ).toISOString(),
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
              }),
            },
            stopWhen: stepCountIs(5),
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

              await db.update(schema.agentChatMessage, assistantMessageId, {
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
              await db.update(schema.agentChatMessage, assistantMessageId, {
                toolCalls: JSON.stringify(toolCallsArr),
              });
            } else if (part.type === "tool-result") {
              console.log(
                `[agent-chat] Tool result for: ${part.toolName}`,
              );
              const idx = toolCallsArr.findIndex(
                (tc) => tc.name === part.toolName && tc.status === "calling",
              );
              if (idx !== -1) {
                toolCallsArr[idx].status = "complete";
                toolCallsArr[idx].result = part.output;
              }
              await db.update(schema.agentChatMessage, assistantMessageId, {
                toolCalls: JSON.stringify(toolCallsArr),
              });
            }
          }

          console.log(
            `[agent-chat] Stream complete: ${chunkCount} chunks, ${accumulated.length} total chars`,
          );
        } catch (error) {
          console.error(
            `[agent-chat] Streaming error after ${chunkCount} chunks:`,
            error,
          );
          await db.update(schema.agentChatMessage, assistantMessageId, {
            content: accumulated || "[Error generating response]",
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

      const chat = await db.findOne(schema.agentChat, req.input.chatId);
      if (!chat) {
        throw new Error("CHAT_NOT_FOUND");
      }

      // Enforce chat ownership
      if (chat.userId !== req.context.session.userId) {
        throw new Error("UNAUTHORIZED");
      }

      // Verify org membership
      const orgUser = Object.values(
        await db.find(schema.organizationUser, {
          where: {
            organizationId: chat.organizationId,
            userId: req.context.session.userId,
            enabled: true,
          },
        }),
      )[0];

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
      const existingAuthor = Object.values(
        await db.find(schema.author, {
          where: {
            userId: req.context.session.userId,
            organizationId: chat.organizationId,
          },
        }),
      )[0];

      let authorId = existingAuthor?.id;

      if (!authorId) {
        const user = await db.findOne(
          schema.user,
          req.context.session.userId,
        );
        authorId = ulid().toLowerCase();
        await db.insert(schema.author, {
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
        const currentChat = await trx.findOne(
          schema.agentChat,
          req.input.chatId,
        );
        if (
          !currentChat?.draft ||
          currentChat.draftStatus !== "active"
        ) {
          throw new Error("NO_ACTIVE_DRAFT");
        }

        // Convert markdown draft to tiptap JSONContent
        const content = JSON.stringify(parse(currentChat.draft));

        await trx.insert(schema.message, {
          id: ulid().toLowerCase(),
          authorId,
          content,
          threadId: chat.threadId,
          createdAt: new Date(),
          origin: null,
          externalMessageId: null,
        });

        // Clear the draft
        await trx.update(schema.agentChat, chat.id, {
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

      const chat = await db.findOne(schema.agentChat, req.input.chatId);
      if (!chat) {
        throw new Error("CHAT_NOT_FOUND");
      }

      // Enforce chat ownership
      if (chat.userId !== req.context.session.userId) {
        throw new Error("UNAUTHORIZED");
      }

      // Verify org membership
      const orgUser = Object.values(
        await db.find(schema.organizationUser, {
          where: {
            organizationId: chat.organizationId,
            userId: req.context.session.userId,
            enabled: true,
          },
        }),
      )[0];

      if (!orgUser) {
        throw new Error("UNAUTHORIZED");
      }

      await db.update(schema.agentChat, chat.id, {
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

      const chat = await db.findOne(schema.agentChat, req.input.chatId);
      if (!chat) {
        throw new Error("CHAT_NOT_FOUND");
      }

      if (chat.userId !== req.context.session.userId) {
        throw new Error("UNAUTHORIZED");
      }

      const orgUser = Object.values(
        await db.find(schema.organizationUser, {
          where: {
            organizationId: chat.organizationId,
            userId: req.context.session.userId,
            enabled: true,
          },
        }),
      )[0];

      if (!orgUser) {
        throw new Error("UNAUTHORIZED");
      }

      if (chat.draftStatus !== "active") {
        throw new Error("NO_ACTIVE_DRAFT");
      }

      await db.update(schema.agentChat, chat.id, {
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
