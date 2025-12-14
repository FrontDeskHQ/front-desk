import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getOAuthState,
} from "better-auth/api";
import { z } from "zod";
import { schema } from "../../live-state/schema";
import { storage } from "../../live-state/storage";

/**
 * Schema for OAuth state data
 * Validates _subdomainOrigin and _originalCallbackURL properties
 * Allows additional fields from Better Auth's OAuth state
 */
const oauthStateSchema = z
  .object({
    _subdomainOrigin: z.string(),
    _originalCallbackURL: z.string().optional(),
  })
  .passthrough();

/**
 * Strict schema for verification token data
 * Only allows sessionToken, userId, subdomain, and callbackURL properties
 */
const verificationTokenDataSchema = z
  .object({
    sessionToken: z.string(),
    userId: z.string(),
    subdomain: z.string(),
    callbackURL: z.string(),
  })
  .strict();

export interface SubdomainOAuthOptions {
  /**
   * The base URL of the application (e.g., "https://app.com")
   * Subdomains will be constructed as {tenantSlug}.{baseDomain}
   */
  baseUrl: string;

  /**
   * Token expiration time in seconds
   * @default 300 (5 minutes)
   */
  tokenExpiresIn?: number;

  /**
   * The key in additionalData that contains the tenant slug
   * @default "tenantSlug"
   */
  tenantSlugKey?: string;
}

/**
 * Generate a cryptographically random string
 */
const generateExchangeToken = (length = 64): string => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join("");
};

/**
 * Plugin that handles social OAuth login across subdomains.
 *
 * Flow:
 * 1. User initiates social login with `additionalData: { tenantSlug: "tenant" }`
 * 2. Before hook reads tenantSlug from additionalData and stores it in OAuth state
 * 3. OAuth flow completes through the social provider
 * 4. After hook intercepts the callback, creates session & exchange token
 * 5. Redirects to subdomain: `tenant.app.com/api/auth/subdomain-session?token=xxx`
 * 6. Subdomain endpoint exchanges token for session cookie scoped to subdomain
 */
export const subdomainOAuth = (options: SubdomainOAuthOptions) => {
  const {
    baseUrl,
    tokenExpiresIn = 300,
    tenantSlugKey = "tenantSlug",
  } = options;

  return {
    id: "subdomain-oauth",
    endpoints: {
      /**
       * Subdomain session endpoint that exchanges a token for a session cookie
       * scoped to the specific subdomain
       */
      subdomainSession: createAuthEndpoint(
        "/subdomain-oauth/retrieve-session",
        {
          method: "GET",
          query: z.object({
            token: z.string(),
            callbackURL: z.string().optional(),
          }),
        },
        async (ctx) => {
          const { token } = ctx.query;

          const defaultErrorURL =
            ctx.context.options.onAPIError?.errorURL ||
            `${ctx.context.baseURL}/error`;

          const verification =
            await ctx.context.internalAdapter.findVerificationValue(
              `subdomain-exchange:${token}`
            );

          if (!verification) {
            ctx.context.logger.error("Exchange token not found or expired");
            throw ctx.redirect(
              `${defaultErrorURL}?error=invalid_or_expired_token`
            );
          }

          await ctx.context.internalAdapter.deleteVerificationValue(
            verification.id
          );

          if (new Date() > verification.expiresAt) {
            ctx.context.logger.error("Exchange token has expired");
            throw ctx.redirect(`${defaultErrorURL}?error=token_expired`);
          }

          let parsedValue: unknown;

          try {
            parsedValue = JSON.parse(verification.value);
          } catch {
            ctx.context.logger.error("Failed to parse exchange token data");
            throw ctx.redirect(`${defaultErrorURL}?error=invalid_token_data`);
          }

          const validationResult =
            verificationTokenDataSchema.safeParse(parsedValue);

          if (!validationResult.success) {
            ctx.context.logger.error(
              "Invalid verification token data schema",
              validationResult.error
            );
            throw ctx.redirect(`${defaultErrorURL}?error=invalid_token_data`);
          }

          const data = validationResult.data;

          const sessionData = await ctx.context.internalAdapter.findSession(
            data.sessionToken
          );

          if (!sessionData) {
            ctx.context.logger.error("Session not found");
            throw ctx.redirect(`${defaultErrorURL}?error=session_not_found`);
          }

          const parsedBaseUrl = new URL(baseUrl);
          const baseDomain = parsedBaseUrl.hostname;

          const cookieDomain = `${data.subdomain}.${baseDomain}`;

          await ctx.setSignedCookie(
            ctx.context.authCookies.sessionToken.name,
            sessionData.session.token,
            ctx.context.secret,
            {
              ...ctx.context.authCookies.sessionToken.options,
              domain: cookieDomain,
            }
          );

          throw ctx.redirect(data.callbackURL);
        }
      ),
    },

    hooks: {
      before: [
        {
          matcher(context) {
            return context.path?.startsWith("/sign-in/social") ?? false;
          },
          handler: createAuthMiddleware(async (ctx) => {
            if (!ctx.body) return;

            const tenantSlug = ctx.body.additionalData?.[tenantSlugKey] as
              | string
              | undefined;

            if (!tenantSlug) {
              return;
            }

            const organization = Object.values(
              await storage.find(schema.organization, {
                where: {
                  slug: tenantSlug,
                },
              })
            )?.[0];

            if (!organization) {
              ctx.context.logger.error("Organization not found");
              throw new APIError("BAD_REQUEST", {
                message: "Organization not found",
              });
            }

            const originalCallbackURL = ctx.body.callbackURL;

            ctx.body.additionalData = {
              ...(ctx.body.additionalData || {}),
              _subdomainOrigin: tenantSlug,
              _originalCallbackURL: originalCallbackURL,
            };
          }),
        },
      ],

      after: [
        {
          matcher(context) {
            return context.path?.startsWith("/callback/") ?? false;
          },
          handler: createAuthMiddleware(async (ctx) => {
            const oauthData = await getOAuthState();

            if (!oauthData) return;

            const validationResult = oauthStateSchema.safeParse(oauthData);

            if (!validationResult.success) {
              ctx.context.logger.error(
                "Invalid OAuth state data",
                validationResult.error
              );
              return;
            }

            const { _subdomainOrigin: subdomain, _originalCallbackURL } =
              validationResult.data;

            if (!subdomain) {
              return;
            }

            const originalCallbackURL = _originalCallbackURL || "/";

            const setCookieHeader =
              ctx.context.responseHeaders?.get("set-cookie");

            if (!setCookieHeader) return;

            const { parseSetCookieHeader } = await import(
              "better-auth/cookies"
            );
            const cookieName = ctx.context.authCookies.sessionToken.name;
            const parsedCookies = parseSetCookieHeader(setCookieHeader);
            const sessionCookie = parsedCookies.get(cookieName);

            if (!sessionCookie?.value) return;

            const newSession = ctx.context.newSession;

            if (!newSession) return;

            const exchangeToken = generateExchangeToken(64);

            const expiresAt = new Date(Date.now() + tokenExpiresIn * 1000);

            const verificationData = {
              sessionToken: newSession.session.token,
              userId: newSession.user.id,
              subdomain,
              callbackURL: originalCallbackURL,
            };

            const verificationValidationResult =
              verificationTokenDataSchema.safeParse(verificationData);

            if (!verificationValidationResult.success) {
              ctx.context.logger.error(
                "Invalid verification data before storage",
                verificationValidationResult.error
              );
              return;
            }

            await ctx.context.internalAdapter.createVerificationValue({
              identifier: `subdomain-exchange:${exchangeToken}`,
              value: JSON.stringify(verificationValidationResult.data),
              expiresAt,
            });

            ctx.setCookie(cookieName, "", {
              ...ctx.context.authCookies.sessionToken.options,
              maxAge: 0,
            });

            const parsedBaseUrl = new URL(baseUrl);
            const betterAuthBaseURL = new URL(ctx.context.baseURL);

            const subdomainURL = `${parsedBaseUrl.protocol}//${subdomain}.${
              parsedBaseUrl.hostname
            }${parsedBaseUrl.port ? `:${parsedBaseUrl.port}` : ""}${
              betterAuthBaseURL.pathname
            }/subdomain-oauth/retrieve-session`;
            const redirectURL = `${subdomainURL}?token=${encodeURIComponent(
              exchangeToken
            )}&callbackURL=${encodeURIComponent(originalCallbackURL)}`;

            throw ctx.redirect(redirectURL);
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
};
