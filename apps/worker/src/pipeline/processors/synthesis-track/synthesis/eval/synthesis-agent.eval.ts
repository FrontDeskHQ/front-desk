import { tool } from "ai";
import z from "zod";
import { evalite } from "evalite";
import { reportTrace } from "evalite/traces";
import type { createSynthesisTools } from "../tools";
import { synthesizeThreadRead } from "../synthesize";
import { synthesisAgentDataset, type SynthesisAgentEvalInput } from "./agent-dataset";
import {
  forbiddenPrimaryKinds,
  minimumToolCalls,
  nonEmptyPrimaryWhenExpected,
  replyFactualityGuard,
  replySubstance,
  requiredPrimaryKinds,
  sourceInputMessageValidity,
} from "./agent-scorers";

type SynthesisTools = ReturnType<typeof createSynthesisTools>;

const createMockTools = (
  fixtures: SynthesisAgentEvalInput["toolFixtures"],
): {
  tools: SynthesisTools;
  counters: {
    read_thread: number;
    search_documentation: number;
    read_documentation_page: number;
  };
} => {
  const counters = {
    read_thread: 0,
    search_documentation: 0,
    read_documentation_page: 0,
  };

  const tools: SynthesisTools = {
    read_thread: tool({
      description: "Read a thread from mocked fixtures.",
      inputSchema: z.object({ threadId: z.string() }),
      execute: async ({ threadId }) => {
        counters.read_thread++;
        const thread = fixtures.threads[threadId];
        if (!thread) return { found: false, reason: "not_found" };
        return { found: true, thread };
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
  ],
});
