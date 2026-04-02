import { evalite } from "evalite";
import { reportTrace } from "evalite/traces";
import "../env";
import { google } from "@ai-sdk/google";
import { generateText, stepCountIs } from "ai";
import { init } from "autoevals";
import { OpenAI } from "openai";
import {
  buildAgentChatTools,
  buildSystemPrompt,
  formatThreadMetadata,
} from "../live-state/router/agent-chat-core";

// Configure autoevals to use Gemini via Google's OpenAI-compatible endpoint
// biome-ignore lint/suspicious/noExplicitAny: OpenAI client type mismatch between duplicate bun copies
init({
  client: new OpenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  }) as any,
  defaultModel: "gemini-3-flash-preview",
});
import {
  toolSelectionDataset,
  proactiveToolDataset,
  draftQualityDataset,
  threadReferenceDataset,
} from "./agent-chat.dataset";
import {
  toolSelectionAccuracy,
  proactiveToolUsage,
  draftQualityScorer,
  draftFactualityScorer,
  threadReferenceFormat,
} from "./agent-chat.scorers";
import { createMockToolImplementations } from "./agent-chat.fixtures";

// Note: traceAISDKModel requires LanguageModelV2, but @ai-sdk/google exports V3.
// Using reportTrace manually to capture LLM call metrics.
const model = google("gemini-3-flash-preview");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Reports an evalite trace from a generateText result for the UI dashboard. */
// biome-ignore lint/suspicious/noExplicitAny: AI SDK result type varies with tool generics
function traceResult(
  result: any,
  start: number,
  systemPrompt: string,
  userMessage: string,
) {
  reportTrace({
    start,
    end: Date.now(),
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    output: result.text || "(tool calls only)",
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
    messages: Array<{ author: string; content: string }>;
  },
  suggestionsContext = "",
) {
  const threadMetadata = formatThreadMetadata({
    name: thread.name,
    author: thread.author,
    createdAt: "2026-03-24T12:00:00Z",
    status: thread.status,
    priority: thread.priority,
    assignee: thread.assignee,
    labels: thread.labels,
  });

  const threadContext = thread.messages
    .map((m) => `[${m.author}]: ${m.content}`)
    .join("\n");

  return buildSystemPrompt({
    threadMetadata,
    threadContext,
    suggestionsContext,
  });
}

// biome-ignore lint/suspicious/noExplicitAny: AI SDK step result type varies with tool generics
function extractToolNames(steps: any[]): string[] {
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
  task: async (input) => {
    const systemPrompt = buildPromptFromThread(input.thread);
    const tools = buildAgentChatTools(
      createMockToolImplementations(input.toolOverrides),
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
  scorers: [toolSelectionAccuracy],
});

// ─── Eval 2: Proactive Tool Usage ────────────────────────────────────────────

evalite("Agent Chat — Proactive Tool Usage", {
  data: () => proactiveToolDataset,
  task: async (input) => {
    const systemPrompt = buildPromptFromThread(
      input.thread,
      input.suggestionsContext,
    );
    const tools = buildAgentChatTools(
      createMockToolImplementations(input.toolOverrides),
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
  scorers: [proactiveToolUsage],
});

// ─── Eval 3: Draft Quality ───────────────────────────────────────────────────

evalite("Agent Chat — Draft Quality", {
  data: () => draftQualityDataset,
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
      }),
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
  scorers: [draftQualityScorer, draftFactualityScorer],
});

// ─── Eval 4: Thread Reference Formatting ─────────────────────────────────────

evalite("Agent Chat — Thread References", {
  data: () => threadReferenceDataset,
  task: async (input) => {
    const systemPrompt = buildPromptFromThread(input.thread);
    const tools = buildAgentChatTools(
      createMockToolImplementations(input.toolOverrides),
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
  scorers: [threadReferenceFormat],
});
