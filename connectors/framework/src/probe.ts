import { z } from "zod";

import {
  CAPABILITY_INVOKE_SECRET_HEADER,
  CAPABILITY_INVOKE_TIMEOUT_MS,
} from "./invoke";

/** Standardized HTTP path every probe-capable connector host exposes. */
export const CONNECTION_PROBE_PATH = "/api/connection/probe";

/**
 * Same shared-secret header as capability invoke — same trust boundary (core ↔
 * connector). Re-exported under the probe name so callers don't import invoke
 * symbols for a non-capability path.
 */
export const CONNECTION_PROBE_SECRET_HEADER = CAPABILITY_INVOKE_SECRET_HEADER;

/** Same bounded deadline as capability invoke. */
export const CONNECTION_PROBE_TIMEOUT_MS = CAPABILITY_INVOKE_TIMEOUT_MS;

/**
 * Probe request body. `config` is the integration's opaque `configStr`,
 * forwarded untouched — only the connector interprets it.
 */
export interface ProbeRequest {
  config: string | null;
}

/** Runtime validator for the probe request body. */
export const probeRequestSchema = z.object({
  config: z.string().nullable(),
});

/**
 * Probe response. Read-only: the connector never writes FrontDesk state.
 * Optional `configStr` is a sanitized suggestion (install identity stripped)
 * for the core to persist when `live` is false.
 */
export interface ProbeResult {
  live: boolean;
  configStr?: string;
}

/** Runtime validator for the probe response. */
export const probeResultSchema = z.object({
  configStr: z.string().optional(),
  live: z.boolean(),
});

/**
 * POST to a connector's connection-probe endpoint and return the parsed result.
 * Throws on a non-2xx response, or on timeout after
 * {@link CONNECTION_PROBE_TIMEOUT_MS} so the caller fails fast (fail soft at
 * the orchestration layer — no silent enable, no clear).
 *
 * `secret` is the shared internal key, sent in
 * {@link CONNECTION_PROBE_SECRET_HEADER}.
 */
export async function probeConnection(
  probeUrl: string,
  request: ProbeRequest,
  options: { secret?: string | null } = {}
): Promise<ProbeResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.secret) {
    headers[CONNECTION_PROBE_SECRET_HEADER] = options.secret;
  }

  let response: Response;
  try {
    response = await fetch(probeUrl, {
      body: JSON.stringify(request),
      headers,
      method: "POST",
      signal: AbortSignal.timeout(CONNECTION_PROBE_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(
        `CONNECTION_PROBE_TIMEOUT: no response after ${CONNECTION_PROBE_TIMEOUT_MS}ms`,
        { cause: error }
      );
    }
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `CONNECTION_PROBE_FAILED: ${response.status} ${detail}`.trim()
    );
  }

  const parsed = probeResultSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(
      `CONNECTION_PROBE_INVALID_RESPONSE: ${parsed.error.issues[0]?.message ?? "invalid body"}`
    );
  }

  return parsed.data;
}
