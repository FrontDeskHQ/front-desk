import { oneTimeTokenClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { useCallback, useEffect, useState } from "react";
import { getBaseApiUrl } from "./urls";

/**
 * Support portal auth client.
 * Uses a single auth endpoint for all orgs with a shared session.
 * The org context is passed via callbackURL to redirect users back to the correct org page.
 */
export const supportAuthClient = createAuthClient({
  baseURL: getBaseApiUrl() as string,
  basePath: "/api/support-auth",
  plugins: [oneTimeTokenClient()],
});

/**
 * Session data returned from the org-bound session check.
 */
interface OrgBoundSession {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string;
  };
}

interface OrgBoundSessionResponse {
  session: OrgBoundSession | null;
  bound: boolean;
  userId?: string;
}

/**
 * Binds the current support session to a specific organization.
 * This should be called after OAuth callback to "activate" the session for this org.
 */
export const bindSessionToOrg = async (
  orgSlug: string
): Promise<{ success: boolean; orgSlug: string; userId?: string }> => {
  const response = await fetch(`${getBaseApiUrl()}/api/support-session/bind`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ orgSlug }),
  });

  if (!response.ok) {
    throw new Error("Failed to bind session to org");
  }

  return response.json();
};

/**
 * Checks if the current session is bound to a specific organization.
 */
export const checkOrgBoundSession = async (
  orgSlug: string
): Promise<OrgBoundSessionResponse> => {
  const response = await fetch(
    `${getBaseApiUrl()}/api/support-session/check?orgSlug=${encodeURIComponent(orgSlug)}`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  if (!response.ok) {
    return { session: null, bound: false };
  }

  return response.json();
};

/**
 * Unbinds the session from a specific organization (org-scoped logout).
 */
export const unbindSessionFromOrg = async (
  orgSlug: string
): Promise<{ success: boolean }> => {
  const response = await fetch(
    `${getBaseApiUrl()}/api/support-session/unbind`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ orgSlug }),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to unbind session from org");
  }

  return response.json();
};

/**
 * React hook for org-scoped session management.
 * Returns the session if bound to the specified org, null otherwise.
 */
export const useOrgBoundSession = (orgSlug: string) => {
  const [session, setSession] = useState<OrgBoundSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBound, setIsBound] = useState(false);

  const checkSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await checkOrgBoundSession(orgSlug);
      setSession(result.session);
      setIsBound(result.bound);
    } catch {
      setSession(null);
      setIsBound(false);
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const signOut = useCallback(async () => {
    try {
      await unbindSessionFromOrg(orgSlug);
      setSession(null);
      setIsBound(false);
    } catch (error) {
      console.error("Failed to sign out from org:", error);
    }
  }, [orgSlug]);

  return {
    session,
    isLoading,
    isBound,
    signOut,
    refetch: checkSession,
  };
};

/**
 * Hook to handle OAuth callback and bind session to org.
 * Should be used on pages that receive OAuth callbacks.
 */
export const useOrgAuthCallback = (orgSlug: string) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processCallback = useCallback(async () => {
    // Check if we have a support session (set by OAuth callback)
    const { data: session } = await supportAuthClient.getSession();

    if (!session) {
      return false;
    }

    setIsProcessing(true);
    setError(null);

    try {
      await bindSessionToOrg(orgSlug);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to bind session");
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [orgSlug]);

  return {
    processCallback,
    isProcessing,
    error,
  };
};
