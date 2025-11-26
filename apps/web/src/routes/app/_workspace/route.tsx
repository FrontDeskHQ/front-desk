import type { InferLiveObject } from "@live-state/sync";
import { ReflagClientProvider } from "@reflag/react-sdk";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import type { schema } from "api/schema";
import { useEffect } from "react";
import { reflagClient } from "~/lib/feature-flag";
import { useOrganizationSwitcher } from "~/lib/hooks/query/use-organization-switcher";
import { fetchClient } from "~/lib/live-state";

export type WindowWithCachedOrgUsers = Window & {
  cachedOrgUsers?: {
    organizationUsers: InferLiveObject<
      (typeof schema)["organizationUser"],
      { organization: true }
    >[];
  };
};
export const Route = createFileRoute("/app/_workspace")({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    let orgUsers =
      typeof window !== "undefined"
        ? (window as WindowWithCachedOrgUsers).cachedOrgUsers
        : undefined;

    if (orgUsers) {
      return orgUsers;
    }

    const user = context.user;

    orgUsers = {
      organizationUsers: await fetchClient.query.organizationUser
        .where({
          userId: user.id,
        })
        .include({
          organization: true,
        })
        .get()
        .catch(() => []),
    };

    if (
      !orgUsers.organizationUsers ||
      orgUsers.organizationUsers.length === 0
    ) {
      throw redirect({
        to: "/app/onboarding",
      });
    }

    if (typeof window !== "undefined") {
      (window as WindowWithCachedOrgUsers).cachedOrgUsers = orgUsers;
    }

    return orgUsers;
  },
});

function RouteComponent() {
  // This is needed to set the active organization in the organization switcher
  useOrganizationSwitcher();

  useEffect(() => {
    reflagClient.initialize();
  }, []);

  return (
    <ReflagClientProvider client={reflagClient}>
      <Outlet />
    </ReflagClientProvider>
  );
}
