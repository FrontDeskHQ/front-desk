import { betterAuth } from "better-auth";
import { oneTimeToken } from "better-auth/plugins";
import { Pool } from "pg";

import "../env";

const useSocialProvider =
  process.env.ENABLE_GOOGLE_LOGIN === "true" ||
  process.env.ENABLE_GOOGLE_LOGIN === "1";

export const auth = betterAuth({
  advanced: {
    useSecureCookies: true,
  },
  baseURL: process.env.BASE_URL,
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
  emailAndPassword: {
    enabled: !useSocialProvider,
  },
  plugins: [oneTimeToken()],
  socialProviders: {
    google: useSocialProvider
      ? {
          redirectURI: `${process.env.BASE_FRONTEND_URL}/api/auth/callback/google`,
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        }
      : undefined,
  },
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? [
    "http://localhost:3000",
  ],
});

export const getSession = async (req: {
  headers: Record<string, string | string[] | undefined>;
}) => {
  const headers = new Headers();

  Object.entries(req.headers).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  });

  return await auth.api.getSession({ headers }).catch(() => null);
};
