import { tool } from "ai";
import z from "zod";

import {
  fetchMirroredIssueByUrl,
  fetchMirroredPrByUrl,
  fetchThreadWithRelations,
} from "../../../../lib/database/client";
import { generateSimilarityEmbedding } from "../../../../lib/entity-embedding";
import { searchSimilarIssues } from "../../../../lib/qdrant/issues";
import {
  readDocumentationPage,
  searchDocumentation,
} from "../../../../lib/qdrant/search-documentation";
import type { Thread } from "../../../../types";

interface CreateSynthesisToolsOptions {
  organizationId: string;
  currentThreadId: string;
  currentThread: Thread;
}

const toOrderedMessages = (thread: Thread) =>
  [...(thread.messages ?? [])]
    .toSorted((a, b) => a.id.localeCompare(b.id))
    .map((message) => ({
      authorId: message.authorId,
      content: message.content,
      createdAt: message.createdAt,
      id: message.id,
    }));

export const createSynthesisTools = (options: CreateSynthesisToolsOptions) => {
  const { organizationId, currentThreadId, currentThread } = options;

  return {
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

    read_pr: tool({
      description:
        "Read a mirrored pull request by its URL (same organization only) to " +
        "verify a candidate link before emitting link_pr. Returns the PR title, " +
        "body, state, draft/merged flags, branch refs, author, and labels.",
      inputSchema: z.object({
        prUrl: z.string(),
      }),
      execute: async ({ prUrl }) => {
        const pr = await fetchMirroredPrByUrl(organizationId, prUrl);

        if (!pr) {
          return {
            found: false,
            reason: "not_mirrored",
          };
        }

        return {
          found: true,
          pr: {
            url: pr.url,
            repoFullName: pr.repoFullName,
            number: pr.number,
            title: pr.title,
            body: pr.body,
            state: pr.state,
            draft: pr.draft,
            merged: pr.merged,
            headRef: pr.headRef,
            baseRef: pr.baseRef,
            authorLogin: pr.authorLogin,
            labels: pr.labels,
          },
        };
      },
    }),

    read_issue: tool({
      description:
        "Read a mirrored issue by its URL (same organization only) to verify a " +
        "candidate link before emitting link_issue, or to confirm an existing " +
        "issue already covers this report. Returns the issue title, body, " +
        "state, author, and labels. A closed issue is a valid link target.",
      inputSchema: z.object({
        issueUrl: z.string(),
      }),
      execute: async ({ issueUrl }) => {
        const issue = await fetchMirroredIssueByUrl(organizationId, issueUrl);

        if (!issue) {
          return {
            found: false,
            reason: "not_mirrored",
          };
        }

        return {
          found: true,
          issue: {
            url: issue.url,
            repoFullName: issue.repoFullName,
            number: issue.number,
            title: issue.title,
            body: issue.body,
            state: issue.state,
            authorLogin: issue.authorLogin,
            labels: issue.labels,
          },
        };
      },
    }),

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

    search_issues: tool({
      description:
        "Search mirrored issues in this organization by a refined query. " +
        "Complements the `related_issues` hint, which is scored against the " +
        "whole thread — use this to probe a specific symptom or phrase. " +
        "Returns open and closed issues alike; a closed issue is often the " +
        "best link and the strongest reason not to file a new one.",
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      execute: async ({ query, limit }) => {
        const vector = await generateSimilarityEmbedding(query);
        if (!vector) {
          return { hits: [] };
        }

        const results = await searchSimilarIssues(vector, {
          limit: limit ?? 5,
          organizationId,
        });

        return {
          hits: results.map((result) => ({
            number: result.payload.number,
            repoFullName: result.payload.repoFullName,
            score: result.score,
            state: result.payload.state,
            title: result.payload.title,
            url: result.payload.url,
          })),
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
  };
};
