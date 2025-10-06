import { SubscriptionProvider } from "@live-state/sync/client";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useAtom } from "jotai/react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { useOrganizationSwitcher } from "~/lib/hooks/query/use-organization-switcher";
import { client, fetchClient } from "~/lib/live-state";

export const Route = createFileRoute("/app/_workspace")({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    const user = context.user;

    const orgUsers = await fetchClient.query.organizationUser
      .where({
        userId: user.id,
      })
      .include({
        organization: true,
      })
      .get()
      .catch(() => null);

    if (!orgUsers || Object.keys(orgUsers).length === 0) {
      throw redirect({
        to: "/onboarding",
      });
    }

    return {
      organizationUsers: orgUsers,
    };
  },
});

function RouteComponent() {
  const { organizationUsers } = useOrganizationSwitcher();

  const [activeOrganization, setActiveOrganization] = useAtom(
    activeOrganizationAtom,
  );

  if (!activeOrganization) {
    setActiveOrganization(
      (Object.values(organizationUsers)[0] as any)?.organization,
    );
  }

  return (
    <SubscriptionProvider client={client}>
      <Outlet />
    </SubscriptionProvider>
  );
}
