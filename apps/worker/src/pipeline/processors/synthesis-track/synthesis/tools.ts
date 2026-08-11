import { tool } from "ai";
import z from "zod";

import {
  fetchMirroredIssueByUrl,
  fetchMirroredPrByUrl,
  fetchThreadWithRelations,
} from "../../../../lib/database/client";
import { generateDocumentationQueryEmbedding } from "../../../../lib/documentation-embedding";
import { generateSimilarityEmbedding } from "../../../../lib/entity-embedding";
import { documentationIndex } from "../../../../lib/qdrant/documentation";
import {
  ISSUE_MATCH_THRESHOLD,
  issueIndex,
} from "../../../../lib/qdrant/issues";
import type { Thread } from "../../../../types";

/**
 * What `search_documentation` hands the synthesis agent. Flat and id-free by
 * design: the agent should see page text and provenance, not the index's
 * internal payload with its organization and source ids.
 */
export interface DocumentationSearchResult {
  pageUrl: string;
  pageTitle: string;
  chunkText: string;
  headingHierarchy: string[];
  score: number;
}

/** What `read_documentation_page` hands the synthesis agent, in page order. */
export interface DocumentationPageChunkResult {
  pageUrl: string;
  pageTitle: string;
  chunkText: string;
  headingHierarchy: string[];
  chunkIndex: number;
}

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
        if (!pageUrl.trim()) {
          return { pageUrl, chunks: [] };
        }
        // Degrade to no chunks rather than throwing: this is one probe inside a
        // tool loop, and failing it would abort the whole synthesis run.
        try {
          const stored = await documentationIndex.scroll({
            limit: limit ?? 50,
            organizationId,
            where: { pageUrl },
          });
          const chunks = stored
            .toSorted((a, b) => a.chunkIndex - b.chunkIndex)
            .map((chunk) => ({
              chunkIndex: chunk.chunkIndex,
              chunkText: chunk.chunkText,
              headingHierarchy: chunk.headingHierarchy,
              pageTitle: chunk.pageTitle,
              pageUrl: chunk.pageUrl,
            }));
          return { pageUrl, chunks };
        } catch {
          return { pageUrl, chunks: [] };
        }
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

        if (thread.deletedAt !== null && thread.deletedAt !== undefined) {
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
        // Degrade to no hits rather than throwing. Unlike the `related_issues`
        // hint — which must distinguish "no matches" from a backend failure so
        // it never clears a valid lead — this is one probe inside a tool loop,
        // and failing it would abort the whole synthesis run.
        let results: Awaited<ReturnType<typeof issueIndex.search>>;
        try {
          const vector = await generateSimilarityEmbedding(query);
          if (!vector) {
            return { hits: [] };
          }
          results = await issueIndex.search(vector, {
            limit: limit ?? 5,
            organizationId,
            scoreThreshold: ISSUE_MATCH_THRESHOLD,
          });
        } catch {
          return { hits: [] };
        }

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
        // Same reasoning as `search_issues`: degrade to no hits rather than
        // aborting the synthesis run on a backend failure.
        try {
          const vector = await generateDocumentationQueryEmbedding(query);
          if (!vector) {
            return { hits: [] };
          }
          const results = await documentationIndex.hybrid(
            { text: query, vector },
            { limit: limit ?? 5, organizationId }
          );
          return {
            hits: results.map((result) => ({
              chunkText: result.payload.chunkText,
              headingHierarchy: result.payload.headingHierarchy,
              pageTitle: result.payload.pageTitle,
              pageUrl: result.payload.pageUrl,
              score: result.score,
            })),
          };
        } catch {
          return { hits: [] };
        }
      },
    }),
  };
};
