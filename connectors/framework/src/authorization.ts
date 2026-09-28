import { z } from "zod";

import { CAPABILITY_INVOKE_TIMEOUT_MS, invokeRemote } from "./invoke";

/**
 * Authorization lifecycle paths every authorization-capable connector host
 * exposes (ADR-0024). Core owns the handshake state and credential custody;
 * the connector owns what the credential means.
 */
export const AUTHORIZATION_URL_PATH = "/api/authorization/url";
export const AUTHORIZATION_REVOKE_PATH = "/api/authorization/revoke";
/** Browser-facing redirect target the external system returns to. */
export const AUTHORIZATION_CALLBACK_PATH = "/authorization/callback";

const AUTHORIZATION_TIMEOUT_MESSAGE = `AUTHORIZATION_TIMEOUT: no response after ${CAPABILITY_INVOKE_TIMEOUT_MS}ms`;

export const authorizationUrlRequestSchema = z.object({
  config: z.string().nullable(),
  integrationId: z.string().min(1),
  state: z.string().min(1),
});
export type AuthorizationUrlRequest = z.infer<
  typeof authorizationUrlRequestSchema
>;

export const authorizationUrlResultSchema = z.object({
  url: z.string().url(),
});

export const authorizationRevokeRequestSchema = z.object({
  config: z.string().nullable(),
  integrationId: z.string().min(1),
});
export type AuthorizationRevokeRequest = z.infer<
  typeof authorizationRevokeRequestSchema
>;

export const authorizationRevokeResultSchema = z.object({
  alreadyRevoked: z.boolean().optional(),
});

/**
 * The external system round-trips a single opaque `state` string. It carries
 * the integration id alongside the secret nonce so the host callback can route
 * the completion without a lookup.
 */
export const encodeAuthorizationState = (
  integrationId: string,
  nonce: string
): string => `${integrationId}.${nonce}`;

export const decodeAuthorizationState = (
  state: string
): { integrationId: string; nonce: string } | null => {
  const separator = state.indexOf(".");
  const integrationId = state.slice(0, separator);
  const nonce = state.slice(separator + 1);
  if (separator < 1 || !nonce) {
    return null;
  }
  return { integrationId, nonce };
};

const authorizationFailure =
  (code: string) =>
  async (response: Response): Promise<{ message: string }> => ({
    message: `${code}: ${response.status}`,
  });

/** Ask a connector host for the URL that starts its authorization handshake. */
export async function requestAuthorizationUrl(
  url: string,
  request: AuthorizationUrlRequest,
  options: { secret?: string | null } = {}
): Promise<z.infer<typeof authorizationUrlResultSchema>> {
  const result = await invokeRemote(url, request, {
    failure: authorizationFailure("AUTHORIZATION_URL_FAILED"),
    redirect: "error",
    secret: options.secret,
    timeoutMessage: AUTHORIZATION_TIMEOUT_MESSAGE,
    timeoutMs: CAPABILITY_INVOKE_TIMEOUT_MS,
  });
  return authorizationUrlResultSchema.parse(result);
}

/** Ask a connector host to revoke an integration's authorization upstream. */
export async function revokeAuthorization(
  url: string,
  request: AuthorizationRevokeRequest,
  options: { secret?: string | null } = {}
): Promise<z.infer<typeof authorizationRevokeResultSchema>> {
  const result = await invokeRemote(url, request, {
    failure: authorizationFailure("AUTHORIZATION_REVOKE_FAILED"),
    redirect: "error",
    secret: options.secret,
    timeoutMessage: AUTHORIZATION_TIMEOUT_MESSAGE,
    timeoutMs: CAPABILITY_INVOKE_TIMEOUT_MS,
  });
  return authorizationRevokeResultSchema.parse(result);
}
