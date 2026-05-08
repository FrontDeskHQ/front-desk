// USD per 1M tokens. Keep in sync with provider pricing pages.
// Embedding models are billed as input-only; we set output=0 so
// estimatedCost still computes correctly through the same code path.
export const AI_PRICING = {
  "anthropic/claude-sonnet-4.6": { input: 3, output: 15 },
  "claude-sonnet-4.6": { input: 3, output: 15 },
  "gemini-3-flash-preview": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-embedding-001": { input: 0.15, output: 0 },
  "google/gemini-embedding-001": { input: 0.15, output: 0 },
} as const satisfies Record<string, { input: number; output: number }>;
