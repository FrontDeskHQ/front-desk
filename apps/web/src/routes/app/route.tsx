import { SubscriptionProvider } from "@live-state/sync/client";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Card } from "@workspace/ui/components/card";
import { useEffect } from "react";
import { client, fetchClient } from "~/lib/live-state";
import type { GetAuthUserResponse } from "~/lib/server-funcs/get-auth-user";
import { getAuthUser } from "~/lib/server-funcs/get-auth-user";

export type WindowWithCachedSession = Window & {
  cachedSession?: GetAuthUserResponse;
};

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    let sessionData =
      typeof window !== "undefined"
        ? (window as WindowWithCachedSession).cachedSession
        : undefined;

    if (sessionData) {
      return sessionData;
    }

    sessionData = await getAuthUser();

    if (!sessionData) {
      throw redirect({
        to: "/",
      });
    }

    const allowlist = await fetchClient.query.allowlist
      .first({
        email: sessionData.user.email,
      })
      .get();

    if (!allowlist) {
      throw redirect({
        to: "/now-allowed",
      });
    }

    if (typeof window !== "undefined") {
      (window as WindowWithCachedSession).cachedSession = sessionData;
    }

    return sessionData;
  },
  component: App,
  ssr: "data-only",
  wrapInSuspense: true,
  pendingComponent: PendingComponent,
  pendingMinMs: 200,
  pendingMs: 50,
});

function App() {
  useEffect(() => {
    client.ws.connect();

    return () => {
      client.ws.disconnect();
    };
  }, []);

  return (
    <SubscriptionProvider client={client}>
      <Outlet />
    </SubscriptionProvider>
  );
}

function PendingComponent() {
  return (
    <div className="w-screen h-screen flex p-2 pl-[16rem]">
      <Card className="flex-1 bg-muted/30" />
    </div>
  );
}
