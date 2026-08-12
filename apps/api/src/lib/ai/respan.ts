import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { GoogleGenerativeAIProvider } from "@ai-sdk/google";

/** Same model the Agent has always used; ids stay unprefixed on this endpoint. */
export const AGENT_MODEL = "gemini-2.5-flash";

/**
 * Google-native passthrough. Unlike Respan's OpenAI-compatible endpoint, this
 * speaks Gemini's own protocol, so `providerOptions.google` — notably
 * `thinkingConfig` — reaches the model instead of being silently dropped.
 */
export const RESPAN_GOOGLE_BASE_URL =
  "https://api.respan.ai/api/google/gemini/v1beta";

/** OpenAI-compatible endpoint, for clients that only speak that protocol. */
export const RESPAN_OPENAI_BASE_URL = "https://api.respan.ai/api";

let provider: GoogleGenerativeAIProvider | undefined;

/**
 * Respan gateway — one `RESPAN_API_KEY` covers every provider it routes to.
 * Built lazily so the key is read after dotenv has loaded.
 * https://www.respan.ai/docs/integrations/gateway/vercel-ai-sdk
 */
export const respan = (): GoogleGenerativeAIProvider => {
  provider ??= createGoogleGenerativeAI({
    apiKey: process.env.RESPAN_API_KEY,
    baseURL: RESPAN_GOOGLE_BASE_URL,
  });
  return provider;
};

export const agentModel = () => respan()(AGENT_MODEL);
