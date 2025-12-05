import { betterAuth } from "better-auth";
import { createAuthMiddleware, getOAuthState } from "better-auth/api";
import { parseSetCookieHeader } from "better-auth/cookies";
import { Pool } from "pg";
import "../env";

const useSocialProvider =
  process.env.ENABLE_GOOGLE_LOGIN === "true" ||
  process.env.ENABLE_GOOGLE_LOGIN === "1";

const isProduction = process.env.NODE_ENV === "production";

export const portalAuth = betterAuth({
  baseURL: process.env.BASE_URL,
  basePath: "/api/portal-auth",
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? [
    "http://localhost:3000",
    "http://*.localhost:3000",
  ],
  advanced: {
    useSecureCookies: isProduction,
    cookiePrefix: "portal-auth",
  },
  emailAndPassword: {
    enabled: !useSocialProvider,
  },
  socialProviders: {
    google: useSocialProvider
      ? {
          redirectURI: `${process.env.BASE_FRONTEND_URL}/api/portal-auth/callback/google`,
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        }
      : undefined,
  },
  account: {
    skipStateCookieCheck: true,
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const oauthData = await getOAuthState();

      if (!oauthData) return;

      const tenantSlug = oauthData.tenantSlug;

      if (!tenantSlug) return;

      const setCookieHeader = ctx.context.responseHeaders?.get("set-cookie");

      if (!setCookieHeader) return;

      const cookieName = ctx.context.authCookies.sessionToken.name;
      const parsedCookies = parseSetCookieHeader(setCookieHeader);
      const sessionCookie = parsedCookies.get(cookieName);

      if (!sessionCookie?.value) return;

      if (isProduction) {
        const ogUrl = new URL(process.env.BASE_FRONTEND_URL as string);
        const subdomain = `${tenantSlug}.${ogUrl.hostname}`;

        await ctx.setSignedCookie(
          cookieName,
          sessionCookie.value,
          ctx.context.secret,
          {
            ...ctx.context.authCookies.sessionToken.options,
            domain: subdomain,
          }
        );
      }
    }),
  },
});
