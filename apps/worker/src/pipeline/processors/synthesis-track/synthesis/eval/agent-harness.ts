import { tool } from "ai";
import type { Tool } from "ai";
import z from "zod";

import type { SynthesisRawActionSet } from "../synthesize";
import { synthesizeThreadRead } from "../synthesize";
import type { createSynthesisTools } from "../tools";
import type { SynthesisAgentEvalInput } from "./agent-dataset";

type SynthesisTools = ReturnType<typeof createSynthesisTools>;

type ToolOutput<T> = T extends Tool<infer _I, infer O> ? O : never;
type ReadThreadOutput = ToolOutput<SynthesisTools["read_thread"]>;
type ReadPrOutput = ToolOutput<SynthesisTools["read_pr"]>;
type ReadIssueOutput = ToolOutput<SynthesisTools["read_issue"]>;

export interface ToolCallCounters {
  read_thread: number;
  read_pr: number;
  read_issue: number;
  search_issues: number;
  search_documentation: number;
  read_documentation_page: number;
}

/** What the scorers grade: one run's action set, tool usage, and fate. */
export interface SynthesisAgentRunResult {
  /** Non-null when the run threw — unparseable model output, most often. */
  error: string | null;
  raw: SynthesisRawActionSet;
  toolCalls: ToolCallCounters;
}

/** What a run that never produced parseable output is worth downstream. */
const emptyActionSet: SynthesisRawActionSet = {
  alternatives: [],
  primary: [],
  reasoning: "",
  recommendation: "",
  sourceInputMessageId: "",
  summary: "",
  urgencyScore: 0,
};

/**
 * The real tool surface backed by case fixtures instead of Postgres and
 * Qdrant. Same shapes the live tools return, including the `found: false`
 * misses — a lead the mirror does not have is a case worth scoring, not a
 * fixture gap to paper over.
 */
export const createMockTools = (
  fixtures: SynthesisAgentEvalInput["toolFixtures"]
): { tools: SynthesisTools; counters: ToolCallCounters } => {
  const counters: ToolCallCounters = {
    read_documentation_page: 0,
    read_issue: 0,
    read_pr: 0,
    read_thread: 0,
    search_documentation: 0,
    search_issues: 0,
  };

  const tools: SynthesisTools = {
    read_documentation_page: tool({
      description: "Read docs page chunks from mocked fixtures.",
      inputSchema: z.object({
        pageUrl: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      execute: async ({ pageUrl }) => {
        counters.read_documentation_page++;
        const chunks = fixtures.docsPageChunksByUrl?.[pageUrl] ?? [];
        return { pageUrl, chunks };
      },
    }),
    read_issue: tool({
      description: "Read a mirrored issue from mocked fixtures.",
      inputSchema: z.object({ issueUrl: z.string() }),
      execute: async ({ issueUrl }): Promise<ReadIssueOutput> => {
        counters.read_issue++;
        const issue = fixtures.issuesByUrl?.[issueUrl];
        if (!issue) return { found: false, reason: "not_mirrored" };
        return { found: true, issue };
      },
    }),
    read_pr: tool({
      description: "Read a mirrored PR from mocked fixtures.",
      inputSchema: z.object({ prUrl: z.string() }),
      execute: async ({ prUrl }): Promise<ReadPrOutput> => {
        counters.read_pr++;
        const pr = fixtures.prsByUrl?.[prUrl];
        if (!pr) return { found: false, reason: "not_mirrored" };
        return { found: true, pr };
      },
    }),
    read_thread: tool({
      description: "Read a thread from mocked fixtures.",
      inputSchema: z.object({ threadId: z.string() }),
      execute: async ({ threadId }): Promise<ReadThreadOutput> => {
        counters.read_thread++;
        const thread = fixtures.threads[threadId];
        if (!thread) return { found: false, reason: "not_found" };
        return {
          found: true,
          thread: {
            id: thread.id,
            name: thread.name ?? "",
            status: thread.status,
            priority: thread.priority,
            createdAt: new Date(thread.createdAt),
            messages: thread.messages.map((message) => ({
              id: message.id,
              authorId: message.authorId,
              content: message.content,
              createdAt: new Date(message.createdAt),
            })),
          },
        };
      },
    }),
    search_documentation: tool({
      description: "Search docs from mocked fixtures.",
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      execute: async ({ query }) => {
        counters.search_documentation++;
        const hits = fixtures.docsSearchHitsByQuery?.[query] ?? [];
        return { hits };
      },
    }),
    search_issues: tool({
      description: "Search mirrored issues from mocked fixtures.",
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      execute: async ({ query }) => {
        counters.search_issues++;
        const hits = fixtures.issueSearchHitsByQuery?.[query] ?? [];
        return { hits };
      },
    }),
  };

  return { counters, tools };
};

/**
 * One scored run. A throwing run is an outcome to measure, not a reason to
 * abandon the suite: `synthesizeThreadRead` raises on unparseable model output,
 * and letting that propagate costs every other case its result. The run
 * degrades to an empty action set — what the pipeline effectively produces —
 * and `synthesisCompleted` scores the failure.
 */
export const runSynthesisAgentCase = async (
  input: SynthesisAgentEvalInput
): Promise<SynthesisAgentRunResult> => {
  const { tools, counters } = createMockTools(input.toolFixtures);

  let raw: SynthesisRawActionSet = emptyActionSet;
  let error: string | null = null;
  try {
    raw = await synthesizeThreadRead(input.synthesisInput, tools);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  return { error, raw, toolCalls: counters };
};
