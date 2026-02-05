import { useLoadData } from "@live-state/sync/client";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Card } from "@workspace/ui/components/card";
import { useEffect } from "react";
import { CommandMenu } from "~/components/command-menu";
import { RootCommands } from "~/lib/commands/commands/root";
import { client, fetchClient, query } from "~/lib/live-state";
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
  const { user } = Route.useRouteContext();
  useEffect(() => {
    client.ws.connect();

    return () => {
      client.ws.disconnect();
    };
  }, []);

  useLoadData(
    client,
    query.organizationUser
      .where({
        userId: user.id,
      })
      .include({
        organization: {
          threads: {
            messages: {
              author: true,
            },
            updates: {
              user: true,
            },
            labels: {
              label: true,
            },
            author: true,
            assignedUser: true,
          },
          invites: true,
          integrations: true,
          subscriptions: true,
          labels: true,
          organizationUsers: {
            user: true,
          },
          authors: true,
          suggestions: true,
          onboardings: true,
        },
      }),
  );

  return (
    <>
      <Outlet />
      <RootCommands />
      <CommandMenu />
    </>
  );
}

function PendingComponent() {
  return (
    <div className="w-screen h-screen flex p-2 pl-[16rem]">
      <Card className="flex-1 bg-muted/30" />
    </div>
  );
}
