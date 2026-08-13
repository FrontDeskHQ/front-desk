import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { GoogleGenerativeAIProvider } from "@ai-sdk/google";

/** Default for pipeline generation; per-call overrides pass their own id. */
export const GENERATION_MODEL = "gemini-2.5-flash";

/**
 * Google-native passthrough. Unlike Respan's OpenAI-compatible endpoint, this
 * speaks Gemini's own protocol, so `providerOptions.google` — notably
 * `thinkingConfig` — reaches the model instead of being silently dropped.
 */
export const RESPAN_GOOGLE_BASE_URL =
  "https://api.respan.ai/api/google/gemini/v1beta";

let provider: GoogleGenerativeAIProvider | undefined;

/**
 * Respan gateway — one `RESPAN_API_KEY` covers every provider it routes to.
 * Built lazily so the key is read after dotenv has loaded.
 * https://www.respan.ai/docs/integrations/gateway/vercel-ai-sdk
 */
export const respan = (): GoogleGenerativeAIProvider => {
  const apiKey = process.env.RESPAN_API_KEY;
  if (!apiKey) {
    // Without this guard the SDK falls back to GOOGLE_GENERATIVE_AI_API_KEY —
    // our embeddings key — and quietly sends it to Respan.
    throw new Error("RESPAN_API_KEY is required for text generation");
  }
  provider ??= createGoogleGenerativeAI({
    apiKey,
    baseURL: RESPAN_GOOGLE_BASE_URL,
  });
  return provider;
};

export const generationModel = (model: string = GENERATION_MODEL) =>
  respan()(model);
