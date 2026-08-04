import { z } from "zod";

import type { Capability } from "./capabilities";

/** Standardized HTTP path every connector host exposes for invoked capabilities. */
export const CAPABILITY_INVOKE_PATH = "/api/capabilities/invoke";

/** Standardized HTTP path every connector host exposes for developer actions. */
export const ACTION_INVOKE_PATH = "/api/actions/invoke";

/** Bounded deadline for an invoke call so an unresponsive connector can't hang the caller. */
export const CAPABILITY_INVOKE_TIMEOUT_MS = 10_000;

/** Developer actions use the same bounded deadline as capability invocations. */
export const ACTION_INVOKE_TIMEOUT_MS = CAPABILITY_INVOKE_TIMEOUT_MS;

/**
 * Header carrying the shared internal secret on invoke requests. The connector
 * host validates it so only the core (which holds the key) can dispatch
 * capabilities. Same trust boundary as the connector→core bot key.
 */
export const CAPABILITY_INVOKE_SECRET_HEADER = "x-connector-secret";

/** Developer actions share the capability invocation trust boundary. */
export const ACTION_INVOKE_SECRET_HEADER = CAPABILITY_INVOKE_SECRET_HEADER;

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

/** Envelope for a named developer action owned by a connector. */
export interface ActionInvokeEnvelope<Payload = unknown> {
  action: string;
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

/** Runtime validator for developer-action envelopes. */
export const actionInvokeEnvelopeSchema = z.object({
  action: z.string().min(1),
  config: z.string().nullable(),
  payload: z.unknown(),
});

interface RemoteInvokeOptions {
  failure: (response: Response) => Promise<string>;
  redirect?: "error" | "follow" | "manual";
  secret?: string | null;
  timeoutMs: number;
  timeoutMessage: string;
}

const invokeRemote = async <Result = unknown>(
  invokeUrl: string,
  envelope: unknown,
  options: RemoteInvokeOptions
): Promise<Result> => {
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
      redirect: options.redirect ?? "follow",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(options.timeoutMessage, { cause: error });
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(await options.failure(response));
  }

  return (await response.json()) as Result;
};

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
  return invokeRemote(invokeUrl, envelope, {
    failure: async (response) => {
      const detail = await response.text().catch(() => "");
      return `CAPABILITY_INVOKE_FAILED: ${response.status} ${detail}`.trim();
    },
    secret: options.secret,
    timeoutMs: CAPABILITY_INVOKE_TIMEOUT_MS,
    timeoutMessage: `CAPABILITY_INVOKE_TIMEOUT: no response after ${CAPABILITY_INVOKE_TIMEOUT_MS}ms`,
  });
}

/**
 * POST a named developer-action envelope to a connector host and return its
 * accepted result. The response body is intentionally not included in error
 * messages so connector configuration cannot leak through the API.
 */
export async function invokeDeveloperAction<Result = unknown>(
  invokeUrl: string,
  envelope: ActionInvokeEnvelope,
  options: { secret?: string | null } = {}
): Promise<Result> {
  return invokeRemote(invokeUrl, envelope, {
    failure: async (response) =>
      `DEVELOPER_ACTION_INVOKE_FAILED: ${response.status}`,
    redirect: "error",
    secret: options.secret,
    timeoutMs: ACTION_INVOKE_TIMEOUT_MS,
    timeoutMessage: `DEVELOPER_ACTION_INVOKE_TIMEOUT: no response after ${ACTION_INVOKE_TIMEOUT_MS}ms`,
  });
}
