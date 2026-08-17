import { generateText, stepCountIs } from "ai";

import "../env";
import { init } from "autoevals";
import { evalite } from "evalite";
import { reportTrace } from "evalite/traces";
import { OpenAI } from "openai";

import {
  agentModel,
  RESPAN_OPENAI_BASE_URL,
} from "../lib/ai/respan";
import {
  buildAgentChatTools,
  buildSystemPrompt,
  formatThreadMetadata,
} from "../live-state/router/agent-chat-core";
import {
  toolSelectionDataset,
  proactiveToolDataset,
  draftQualityDataset,
  threadReferenceDataset,
} from "./agent-chat.dataset";
import { createMockToolImplementations } from "./agent-chat.fixtures";
import {
  JUDGE_MODEL,
  toolSelectionAccuracy,
  proactiveToolUsage,
  draftQualityScorer,
  draftFactualityScorer,
  threadReferenceFormat,
} from "./agent-chat.scorers";

// Configure autoevals to judge via the Respan OpenAI-compatible gateway.
// Judges stay on Gemini: ClosedQA uses tool_choice, which DeepSeek-V4-Flash
// thinking mode rejects. The agent under test still uses agentModel().
// Cast through `never` — autoevals may resolve a different openai package instance.
init({
  client: new OpenAI({
    apiKey: process.env.RESPAN_API_KEY,
    baseURL: RESPAN_OPENAI_BASE_URL,
  }) as never,
  defaultModel: JUDGE_MODEL,
});

// Note: traceAISDKModel requires LanguageModelV2, but the provider exports V3.
// Using reportTrace manually to capture LLM call metrics.
const model = agentModel();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Reports an evalite trace from a generateText result for the UI dashboard. */
interface EvalGenerateTextResult {
  text: string;
  steps: { toolCalls?: { toolName: string }[] }[];
  totalUsage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

function traceResult(
  result: EvalGenerateTextResult,
  start: number,
  systemPrompt: string,
  userMessage: string
) {
  reportTrace({
    end: Date.now(),
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    output: result.text || "(tool calls only)",
    start,
    usage: {
      inputTokens: result.totalUsage.inputTokens ?? 0,
      outputTokens: result.totalUsage.outputTokens ?? 0,
      totalTokens: result.totalUsage.totalTokens ?? 0,
    },
  });
}

function buildPromptFromThread(
  thread: {
    name: string;
    author: string;
    status: string;
    priority: string;
    assignee: string | null;
    labels: string[];
    messages: { author: string; content: string }[];
  },
  suggestionsContext = ""
) {
  const threadMetadata = formatThreadMetadata({
    assignee: thread.assignee,
    author: thread.author,
    createdAt: "2026-03-24T12:00:00Z",
    labels: thread.labels,
    name: thread.name,
    priority: thread.priority,
    status: thread.status,
  });

  const threadContext = thread.messages
    .map((m) => `[${m.author}]: ${m.content}`)
    .join("\n");

  return buildSystemPrompt({
    suggestionsContext,
    threadContext,
    threadMetadata,
  });
}

function extractToolNames(
  steps: { toolCalls?: { toolName: string }[] }[]
): string[] {
  const toolNames: string[] = [];
  for (const step of steps) {
    if (step.toolCalls) {
      for (const call of step.toolCalls) {
        if (!toolNames.includes(call.toolName)) {
          toolNames.push(call.toolName);
        }
      }
    }
  }
  return toolNames;
}

// ─── Eval 1: Tool Selection ──────────────────────────────────────────────────

evalite("Agent Chat — Tool Selection", {
  data: () => toolSelectionDataset,
  scorers: [toolSelectionAccuracy],
  task: async (input) => {
    const systemPrompt = buildPromptFromThread(input.thread);
    const tools = buildAgentChatTools(
      createMockToolImplementations(input.toolOverrides)
    );

    const start = Date.now();
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: input.userMessage }],
      tools,
      stopWhen: stepCountIs(12),
    });
    traceResult(result, start, systemPrompt, input.userMessage);

    return extractToolNames(result.steps);
  },
});

// ─── Eval 2: Proactive Tool Usage ────────────────────────────────────────────

evalite("Agent Chat — Proactive Tool Usage", {
  data: () => proactiveToolDataset,
  scorers: [proactiveToolUsage],
  task: async (input) => {
    const systemPrompt = buildPromptFromThread(
      input.thread,
      input.suggestionsContext
    );
    const tools = buildAgentChatTools(
      createMockToolImplementations(input.toolOverrides)
    );

    const start = Date.now();
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: input.userMessage }],
      tools,
      stopWhen: stepCountIs(12),
    });
    traceResult(result, start, systemPrompt, input.userMessage);

    return extractToolNames(result.steps);
  },
});

// ─── Eval 3: Draft Quality ───────────────────────────────────────────────────

evalite("Agent Chat — Draft Quality", {
  data: () => draftQualityDataset,
  scorers: [draftQualityScorer, draftFactualityScorer],
  task: async (input) => {
    let capturedDraft = "";

    const systemPrompt = buildPromptFromThread(input.thread);
    const tools = buildAgentChatTools(
      createMockToolImplementations({
        ...input.toolOverrides,
        setDraft: async ({ content }) => {
          capturedDraft = content;
          return { success: true };
        },
      })
    );

    const start = Date.now();
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: input.userMessage }],
      tools,
      stopWhen: stepCountIs(12),
    });
    traceResult(result, start, systemPrompt, input.userMessage);

    return capturedDraft || "(no draft was created)";
  },
});

// ─── Eval 4: Thread Reference Formatting ─────────────────────────────────────

evalite("Agent Chat — Thread References", {
  data: () => threadReferenceDataset,
  scorers: [threadReferenceFormat],
  task: async (input) => {
    const systemPrompt = buildPromptFromThread(input.thread);
    const tools = buildAgentChatTools(
      createMockToolImplementations(input.toolOverrides)
    );

    const start = Date.now();
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: input.userMessage }],
      tools,
      stopWhen: stepCountIs(12),
    });
    traceResult(result, start, systemPrompt, input.userMessage);

    return result.text;
  },
});
