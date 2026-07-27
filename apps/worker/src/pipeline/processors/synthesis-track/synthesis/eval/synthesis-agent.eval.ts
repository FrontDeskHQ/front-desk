import { tool } from "ai";
import type { Tool } from "ai";
import { evalite } from "evalite";
import { reportTrace } from "evalite/traces";
import z from "zod";

import { synthesizeThreadRead } from "../synthesize";
import type { createSynthesisTools } from "../tools";
import { synthesisAgentDataset } from "./agent-dataset";
import type { SynthesisAgentEvalInput } from "./agent-dataset";
import {
  atMostOneLinkPr,
  expectedLinkPrUrl,
  forbiddenPrimaryKinds,
  minimumToolCalls,
  nonEmptyPrimaryWhenExpected,
  reasoningUserSafe,
  replyFactualityGuard,
  replySubstance,
  requiredPrimaryKinds,
  sourceInputMessageValidity,
  unrepliedThreadReplyCoupling,
} from "./agent-scorers";

type SynthesisTools = ReturnType<typeof createSynthesisTools>;

type ToolOutput<T> = T extends Tool<infer _I, infer O> ? O : never;
type ReadThreadOutput = ToolOutput<SynthesisTools["read_thread"]>;
type ReadPrOutput = ToolOutput<SynthesisTools["read_pr"]>;

const createMockTools = (
  fixtures: SynthesisAgentEvalInput["toolFixtures"]
): {
  tools: SynthesisTools;
  counters: {
    read_thread: number;
    read_pr: number;
    search_documentation: number;
    read_documentation_page: number;
  };
} => {
  const counters = {
    read_documentation_page: 0,
    read_pr: 0,
    read_thread: 0,
    search_documentation: 0,
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
  };

  return { counters, tools };
};

evalite("Synthesis Agent (Model In Loop)", {
  data: () =>
    synthesisAgentDataset.map((testCase) => ({
      input: {
        synthesisInput: testCase.input,
        toolFixtures: testCase.toolFixtures,
      },
      expected: testCase.expected,
    })),
  scorers: [
    nonEmptyPrimaryWhenExpected,
    requiredPrimaryKinds,
    forbiddenPrimaryKinds,
    sourceInputMessageValidity,
    replySubstance,
    replyFactualityGuard,
    minimumToolCalls,
    reasoningUserSafe,
    unrepliedThreadReplyCoupling,
    atMostOneLinkPr,
    expectedLinkPrUrl,
  ],
  task: async (input) => {
    const start = Date.now();
    const { tools, counters } = createMockTools(input.toolFixtures);
    const raw = await synthesizeThreadRead(input.synthesisInput, tools);
    const result = {
      raw,
      toolCalls: counters,
    };

    reportTrace({
      start,
      end: Date.now(),
      input: [
        {
          role: "user",
          content: JSON.stringify(input, null, 2),
        },
      ],
      output: JSON.stringify(result),
    });
    return result;
  },
});
