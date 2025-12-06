import { betterAuth } from "better-auth";
import { Pool } from "pg";
import "../env";
import { subdomainOAuth } from "./plugins/subdomain-oauth";

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
    storeStateStrategy: "database",
    skipStateCookieCheck: true,
  },
  plugins: [
    subdomainOAuth({
      baseUrl: process.env.BASE_FRONTEND_URL as string,
    }),
  ],
});
