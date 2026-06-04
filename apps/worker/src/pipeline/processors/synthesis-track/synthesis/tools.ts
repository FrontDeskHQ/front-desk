import { tool } from "ai";
import z from "zod";
import { fetchThreadWithRelations } from "../../../../lib/database/client";
import {
  readDocumentationPage,
  searchDocumentation,
} from "../../../../lib/qdrant/search-documentation";
import type { Thread } from "../../../../types";

type CreateSynthesisToolsOptions = {
  organizationId: string;
  currentThreadId: string;
  currentThread: Thread;
};

const toOrderedMessages = (thread: Thread) =>
  [...(thread.messages ?? [])]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((message) => ({
      id: message.id,
      authorId: message.authorId,
      content: message.content,
      createdAt: message.createdAt,
    }));

export const createSynthesisTools = (options: CreateSynthesisToolsOptions) => {
  const { organizationId, currentThreadId, currentThread } = options;

  return {
    read_thread: tool({
      description:
        "Read a full support thread by id (same organization only), including all messages in chronological order.",
      inputSchema: z.object({
        threadId: z.string(),
      }),
      execute: async ({ threadId }) => {
        const thread =
          threadId === currentThreadId
            ? currentThread
            : await fetchThreadWithRelations(threadId);

        if (!thread) {
          return {
            found: false,
            reason: "not_found",
          };
        }

        if (thread.organizationId !== organizationId) {
          return {
            found: false,
            reason: "organization_mismatch",
          };
        }

        return {
          found: true,
          thread: {
            id: thread.id,
            name: thread.name,
            status: thread.status,
            priority: thread.priority,
            createdAt: thread.createdAt,
            messages: toOrderedMessages(thread),
          },
        };
      },
    }),

    search_documentation: tool({
      description:
        "Search documentation chunks for a refined query in this organization.",
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      execute: async ({ query, limit }) => {
        const hits = await searchDocumentation({
          query,
          organizationId,
          limit,
        });
        return { hits };
      },
    }),

    read_documentation_page: tool({
      description:
        "Read full documentation chunks for a specific page URL in this organization.",
      inputSchema: z.object({
        pageUrl: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      execute: async ({ pageUrl, limit }) => {
        const chunks = await readDocumentationPage({
          pageUrl,
          organizationId,
          limit,
        });
        return {
          pageUrl,
          chunks,
        };
      },
    }),
  };
};
