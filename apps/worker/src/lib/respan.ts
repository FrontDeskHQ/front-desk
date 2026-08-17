import { createOpenAI } from "@ai-sdk/openai";
import type { OpenAIProvider } from "@ai-sdk/openai";

/** Default for pipeline generation; per-call overrides pass their own id. */
export const GENERATION_MODEL = "deepseek/deepseek-v4-flash";

/**
 * OpenAI-compatible Respan gateway. AI SDK 7's default `provider()` call uses
 * the Responses API; `.chat()` hits `/chat/completions`.
 * https://www.respan.ai/docs/integrations/gateway/vercel-ai-sdk
 */
export const RESPAN_OPENAI_BASE_URL = "https://api.respan.ai/api";

interface ChatCompletionsBody {
  messages?: { role: string; content?: unknown }[];
  response_format?: {
    type?: string;
    json_schema?: { schema?: unknown };
  };
}

/**
 * DeepSeek-V4-Flash rejects `response_format: json_schema`. Downgrade to
 * `json_object` and put the schema in the prompt so the SDK can still
 * validate the parsed object. DeepSeek also requires the word "json".
 */
const rewriteJsonSchemaBody = (raw: string): string | undefined => {
  const body = JSON.parse(raw) as ChatCompletionsBody;
  if (body.response_format?.type !== "json_schema") {
    return undefined;
  }

  const schema = body.response_format.json_schema?.schema;
  body.response_format = { type: "json_object" };
  body.messages = [
    ...(body.messages ?? []),
    {
      role: "user",
      content: schema
        ? `Respond with JSON matching this schema:\n${JSON.stringify(schema)}`
        : "Respond with JSON.",
    },
  ];
  return JSON.stringify(body);
};

const fetchWithoutJsonSchema = async (
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> => {
  let requestInit = init;
  if (requestInit?.body && typeof requestInit.body === "string") {
    try {
      const rewritten = rewriteJsonSchemaBody(requestInit.body);
      if (rewritten) {
        requestInit = { ...requestInit, body: rewritten };
      }
    } catch {
      // Leave the body unchanged if it isn't JSON.
    }
  }
  return globalThis.fetch(input, requestInit);
};

let provider: OpenAIProvider | undefined;

/**
 * Respan gateway — one `RESPAN_API_KEY` covers every provider it routes to.
 * Built lazily so the key is read after dotenv has loaded.
 */
export const respan = (): OpenAIProvider => {
  const apiKey = process.env.RESPAN_API_KEY;
  if (!apiKey) {
    // Without this guard the SDK falls back to OPENAI_API_KEY.
    throw new Error("RESPAN_API_KEY is required for text generation");
  }
  provider ??= createOpenAI({
    apiKey,
    baseURL: RESPAN_OPENAI_BASE_URL,
    fetch: fetchWithoutJsonSchema as typeof fetch,
    name: "respan",
  });
  return provider;
};

export const generationModel = (model: string = GENERATION_MODEL) =>
  respan().chat(model);
