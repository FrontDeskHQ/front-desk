// USD per 1M tokens. Gemini (embeddings) tracks
// https://ai.google.dev/gemini-api/docs/pricing; generation runs through the
// Respan OpenAI-compatible gateway (DeepSeek-V4-Flash). Embedding
// models are billed as input-only;
// we set output=0 so estimatedCost still computes correctly through the same
// code path.
export const AI_PRICING = {
  "deepseek/deepseek-v4-flash": { input: 0.08, output: 0.18 },
  "gemini-embedding-001": { input: 0.15, output: 0 },
  "google/gemini-embedding-001": { input: 0.15, output: 0 },
} as const satisfies Record<string, { input: number; output: number }>;
