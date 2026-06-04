// USD per 1M tokens. Keep in sync with https://ai.google.dev/gemini-api/docs/pricing.
// Embedding models are billed as input-only; we set output=0 so
// estimatedCost still computes correctly through the same code path.
// Tiered models (Pro) use the >200k-token tier as a conservative upper bound.
export const AI_PRICING = {
  "gemini-3-flash-preview": { input: 1.5, output: 9 },
  "gemini-3.5-flash": { input: 1.5, output: 9 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-3.1-pro-preview": { input: 4, output: 18 },
  "gemini-2.5-pro": { input: 2.5, output: 15 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-embedding-001": { input: 0.15, output: 0 },
  "google/gemini-embedding-001": { input: 0.15, output: 0 },
} as const satisfies Record<string, { input: number; output: number }>;
