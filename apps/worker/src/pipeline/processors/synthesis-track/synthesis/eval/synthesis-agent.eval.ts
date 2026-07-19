import { tool, type Tool } from "ai";
import z from "zod";
import { evalite } from "evalite";
import { reportTrace } from "evalite/traces";
import type { createSynthesisTools } from "../tools";
import { synthesizeThreadRead } from "../synthesize";
import { synthesisAgentDataset, type SynthesisAgentEvalInput } from "./agent-dataset";
import {
  atMostOneLinkPr,
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
  fixtures: SynthesisAgentEvalInput["toolFixtures"],
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
    read_thread: 0,
    read_pr: 0,
    search_documentation: 0,
    read_documentation_page: 0,
  };

  const tools: SynthesisTools = {
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
  };

  return { tools, counters };
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
  ],
});
