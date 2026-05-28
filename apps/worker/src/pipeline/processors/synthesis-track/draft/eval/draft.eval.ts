import { init } from "autoevals";
import { evalite } from "evalite";
import { reportTrace } from "evalite/traces";
import { OpenAI } from "openai";

// Configure autoevals (LLM-as-judge scorers) to use Gemini via Google's
// OpenAI-compatible endpoint. Must run before the scorers are invoked.
init({
  client: new OpenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    // biome-ignore lint/suspicious/noExplicitAny: OpenAI client type mismatch between duplicate bun copies
  }) as any,
  defaultModel: "gemini-2.5-flash",
});

import { draftReply } from "../draft";
import { draftGeneratorDataset } from "./dataset";
import {
  draftFactuality,
  draftQuality,
  keywordHits,
  noSignOff,
  nullCandidateAccuracy,
} from "./scorers";

evalite("Draft Generator", {
  data: () =>
    draftGeneratorDataset.map((c) => ({
      input: c.input,
      expected: { description: c.expected, expectations: c.expectations },
    })),
  task: async (input) => {
    const start = Date.now();
    const result = await draftReply(input);
    const transcript = input.recentMessages
      .map((m, i) => `${i + 1}. [${m.role}] ${m.content}`)
      .join("\n");
    reportTrace({
      start,
      end: Date.now(),
      input: [
        {
          role: "user",
          content: `Title: ${input.threadName ?? "(none)"}\nLabels: ${input.appliedLabels.join(", ") || "(none)"}\nMessages:\n${transcript}`,
        },
      ],
      output: result.draftMarkdown ?? "(null — no draft)",
    });
    return result;
  },
  scorers: [
    draftFactuality,
    draftQuality,
    keywordHits,
    noSignOff,
    nullCandidateAccuracy,
  ],
});
