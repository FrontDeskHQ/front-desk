import { z } from "zod";

import type { Capability } from "./capabilities";

/** Standardized HTTP path every connector host exposes for invoked capabilities. */
export const CAPABILITY_INVOKE_PATH = "/api/capabilities/invoke";

/** Bounded deadline for an invoke call so an unresponsive connector can't hang the caller. */
export const CAPABILITY_INVOKE_TIMEOUT_MS = 10_000;

/**
 * Header carrying the shared internal secret on invoke requests. The connector
 * host validates it so only the core (which holds the key) can dispatch
 * capabilities. Same trust boundary as the connector→core bot key.
 */
export const CAPABILITY_INVOKE_SECRET_HEADER = "x-connector-secret";

/**
 * The standardized invoke envelope. `config` is the integration's opaque
 * `configStr`, forwarded untouched — only the connector interprets it.
 */
export interface InvokeEnvelope<Payload = unknown> {
  capability: Capability;
  method: string;
  config: string | null;
  payload: Payload;
}

/** Runtime validator for the envelope, for connectors receiving invocations. */
export const invokeEnvelopeSchema = z.object({
  capability: z.string(),
  config: z.string().nullable(),
  method: z.string(),
  payload: z.unknown(),
});

/**
 * POST a normalized envelope to a connector's invoke endpoint and return the
 * parsed JSON result. Throws on a non-2xx response, or on timeout after
 * {@link CAPABILITY_INVOKE_TIMEOUT_MS} so the caller fails fast.
 *
 * `secret` is the shared internal key, sent in
 * {@link CAPABILITY_INVOKE_SECRET_HEADER} so the connector can authenticate the
 * caller.
 */
export async function invokeCapability<Result = unknown>(
  invokeUrl: string,
  envelope: InvokeEnvelope,
  options: { secret?: string | null } = {}
): Promise<Result> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.secret) {
    headers[CAPABILITY_INVOKE_SECRET_HEADER] = options.secret;
  }

  let response: Response;
  try {
    response = await fetch(invokeUrl, {
      body: JSON.stringify(envelope),
      headers,
      method: "POST",
      signal: AbortSignal.timeout(CAPABILITY_INVOKE_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(
        `CAPABILITY_INVOKE_TIMEOUT: no response after ${CAPABILITY_INVOKE_TIMEOUT_MS}ms`,
        { cause: error }
      );
    }
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `CAPABILITY_INVOKE_FAILED: ${response.status} ${detail}`.trim()
    );
  }

  return (await response.json()) as Result;
}
