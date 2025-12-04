import { betterAuth } from "better-auth";
import { oneTimeToken } from "better-auth/plugins";
import type { Request, Response } from "express";
import { Pool } from "pg";
import "../env";

const useSocialProvider = !!process.env.ENABLE_GOOGLE_LOGIN;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? [
  "http://localhost:3000",
];

const useSecureCookies =
  process.env.NODE_ENV === "production" ||
  process.env.USE_SECURE_COOKIES === "true";

/**
 * Main application authentication instance.
 * Used for the main app at /app/* routes.
 */
export const auth = betterAuth({
  baseURL: process.env.BASE_URL ?? "http://localhost:3333",
  database: pool,
  trustedOrigins,
  advanced: {
    useSecureCookies,
  },
  emailAndPassword: {
    enabled: !useSocialProvider,
  },
  socialProviders: {
    google: useSocialProvider
      ? {
          redirectURI: `${process.env.BASE_FRONTEND_URL ?? "http://localhost:3000"}/api/auth/callback/google`,
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        }
      : undefined,
  },
  plugins: [oneTimeToken()],
});

/**
 * Support portal authentication instance.
 * Uses a single OAuth callback URL for all orgs, with org slug passed via state parameter.
 * Each org still gets its own cookie prefix for session isolation.
 */
export const supportAuth = betterAuth({
  baseURL: process.env.BASE_URL ?? "http://localhost:3333",
  basePath: "/api/support-auth",
  database: pool,
  trustedOrigins,
  advanced: {
    useSecureCookies,
    cookiePrefix: "support",
  },
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    google: useSocialProvider
      ? {
          // Single callback URL registered in Google Console
          redirectURI: `${process.env.BASE_FRONTEND_URL ?? "http://localhost:3000"}/api/support-auth/callback/google`,
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

export const getSupportSession = async (req: {
  headers: Record<string, any>;
}) => {
  const headers = new Headers();

  Object.entries(req.headers).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return await supportAuth.api.getSession({ headers }).catch(() => null);
};

/**
 * Sanitizes an org slug for use in cookie names.
 * Only allows alphanumeric characters and hyphens.
 */
const sanitizeOrgSlug = (slug: string): string => {
  return slug.replace(/[^a-zA-Z0-9-]/g, "");
};

/**
 * Gets the cookie name for org-scoped session binding.
 */
const getOrgSessionCookieName = (orgSlug: string): string => {
  return `support_org_${sanitizeOrgSlug(orgSlug)}`;
};

/**
 * Binds the current support session to a specific organization.
 * This sets an org-specific cookie that indicates the user has authenticated for this org.
 */
export const bindSessionToOrg = async (req: Request, res: Response) => {
  const { orgSlug } = req.body;

  if (!orgSlug || typeof orgSlug !== "string") {
    return res.status(400).json({ error: "orgSlug is required" });
  }

  // Verify the user has a valid support session
  const session = await getSupportSession(req);

  if (!session) {
    return res.status(401).json({ error: "No valid support session" });
  }

  const cookieName = getOrgSessionCookieName(orgSlug);

  // Set org-specific cookie with the user ID to bind this session to the org
  res.cookie(cookieName, session.user.id, {
    httpOnly: true,
    secure: useSecureCookies,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });

  return res.json({
    success: true,
    orgSlug: sanitizeOrgSlug(orgSlug),
    userId: session.user.id,
  });
};

/**
 * Checks if the current session is bound to a specific organization.
 * Returns the session if bound, null otherwise.
 */
export const getOrgBoundSession = async (req: Request, res: Response) => {
  const { orgSlug } = req.query;

  if (!orgSlug || typeof orgSlug !== "string") {
    return res.status(400).json({ error: "orgSlug query parameter is required" });
  }

  // Check for valid support session
  const session = await getSupportSession(req);

  if (!session) {
    return res.json({ session: null, bound: false });
  }

  // Check for org-specific binding cookie
  const cookieName = getOrgSessionCookieName(orgSlug);
  const boundUserId = req.cookies?.[cookieName];

  // Session is only valid for this org if the binding cookie matches the session user
  const isBound = boundUserId === session.user.id;

  return res.json({
    session: isBound ? session : null,
    bound: isBound,
    userId: session.user.id,
  });
};

/**
 * Unbinds the session from a specific organization (org-scoped logout).
 */
export const unbindSessionFromOrg = async (req: Request, res: Response) => {
  const { orgSlug } = req.body;

  if (!orgSlug || typeof orgSlug !== "string") {
    return res.status(400).json({ error: "orgSlug is required" });
  }

  const cookieName = getOrgSessionCookieName(orgSlug);

  // Clear the org-specific cookie
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: useSecureCookies,
    sameSite: "lax",
    path: "/",
  });

  return res.json({ success: true, orgSlug: sanitizeOrgSlug(orgSlug) });
};
