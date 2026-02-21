import { google } from "@ai-sdk/google";
import { stepCountIs, streamText, tool } from "ai";
import { ulid } from "ulid";
import { z } from "zod";
import { searchDocumentation } from "../../lib/search/qdrant";
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

      const id = ulid().toLowerCase();

      const agentChat = await db.insert(schema.agentChat, {
        id,
        organizationId: req.input.organizationId,
        userId: req.context.session.userId,
        threadId: req.input.threadId,
        createdAt: new Date(),
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
        createdAt: new Date(),
      });

      // Create assistant message placeholder
      const assistantMessageId = ulid().toLowerCase();
      await db.insert(schema.agentChatMessage, {
        id: assistantMessageId,
        agentChatId: req.input.chatId,
        role: "assistant",
        content: "",
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
      for (const authorId of allAuthorIds) {
        const author = await db.findOne(schema.author, authorId);
        if (author) authors.set(authorId, author.name);
      }

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
      for (const tl of threadLabels) {
        const label = await db.findOne(schema.label, tl.labelId);
        if (label?.enabled) labelNames.push(label.name);
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

      const systemPrompt = `You are a helpful AI assistant for a customer support team. You have access to the following support thread for context.

## Thread Details
${threadMetadata}

## Thread Messages
${threadContext}

You have a tool called "searchDocumentation" that lets you search the organization's documentation. Use it when the user asks questions that might be answered by documentation, or when you need to look up product details, guides, or technical information.

Use the thread context to help answer questions about this support thread. Be concise and helpful.`;

      console.log(systemPrompt);

      // Stream in background — don't await, let the mutation return immediately
      // so the client sees the user message + empty assistant message right away.
      (async () => {
        let accumulated = "";
        let chunkCount = 0;
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
            },
            stopWhen: stepCountIs(3),
          });

          console.log("[agent-chat] streamText() called, awaiting chunks...");

          for await (const chunk of result.textStream) {
            chunkCount++;
            accumulated += chunk;

            if (chunkCount <= 3 || chunkCount % 10 === 0) {
              console.log(
                `[agent-chat] Chunk #${chunkCount}: +${chunk.length} chars, total=${accumulated.length} chars`,
              );
            }

            await db.update(schema.agentChatMessage, assistantMessageId, {
              content: accumulated,
            });
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
