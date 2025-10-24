import { betterAuth } from "better-auth";
import { oneTimeToken } from "better-auth/plugins";
import { Pool } from "pg";
import "../env";

const useSocialProvider = !!process.env.ENABLE_GOOGLE_LOGIN;

export const auth = betterAuth({
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
});

export const getSession = async (req: { headers: Record<string, any> }) => {
  const headers = new Headers();

  Object.entries(req.headers).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return await auth.api.getSession({ headers }).catch(() => null);
};
