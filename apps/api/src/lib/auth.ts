import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { oneTimeToken } from "better-auth/plugins";
import { Pool } from "pg";
import { db } from "..";
import "../env";
import { schema } from "../live-state/schema";

const useSocialProvider = !!process.env.ENABLE_GOOGLE_LOGIN;

export const auth = betterAuth({
  baseURL: process.env.BASE_URL,
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
  trustedOrigins: [process.env.CORS_ORIGIN ?? "http://localhost:3000"],
  emailAndPassword: {
    enabled: !useSocialProvider,
  },
  socialProviders: {
    google: useSocialProvider
      ? {
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        }
      : undefined,
  },
  plugins: [oneTimeToken()],
  hooks: {
    before: createAuthMiddleware(async ({ body, path }) => {
      if (!path.startsWith("/sign-in") && !path.startsWith("/sign-up")) return;

      const email = (body as any)?.email?.toLowerCase();

      if (!email) {
        throw new APIError("BAD_REQUEST", {
          message: "Email is required",
        });
      }

      const allowlist = await db.find(schema.allowlist, {
        where: { email },
      });

      if (!Object.keys(allowlist).length) {
        throw new APIError("BAD_REQUEST", {
          message: "Email not accepted into the beta",
        });
      }
    }),
  },
});

export const getSession = async (req: { headers: Record<string, any> }) => {
  const headers = new Headers();

  Object.entries(req.headers).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return await auth.api.getSession({ headers }).catch(() => null);
};
