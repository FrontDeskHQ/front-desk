import { SubscriptionProvider } from "@live-state/sync/client";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { client, fetchClient } from "~/lib/live-state";
import { getAuthUser } from "~/lib/server-funcs/get-auth-user";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const user = await getAuthUser();

    if (!user) {
      throw redirect({
        to: "/",
      });
    }

    const allowlist = await fetchClient.query.allowlist
      .first({
        email: user.user.email,
      })
      .get();

    if (!allowlist) {
      throw redirect({
        to: "/now-allowed",
      });
    }

    return user;
  },
  component: App,
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
