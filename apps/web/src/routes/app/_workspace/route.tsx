import { InferLiveObject } from "@live-state/sync";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { schema } from "api/schema";
import { useAtom } from "jotai/react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { useOrganizationSwitcher } from "~/lib/hooks/query/use-organization-switcher";
import { fetchClient } from "~/lib/live-state";

let cachedOrgUsers: {
  organizationUsers: InferLiveObject<
    (typeof schema)["organizationUser"],
    { organization: true }
  >[];
} | null = null;

export const Route = createFileRoute("/app/_workspace")({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    if (cachedOrgUsers) {
      return cachedOrgUsers;
    }

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
        to: "/app/onboarding",
      });
    }

    cachedOrgUsers = {
      organizationUsers: orgUsers,
    };

    return cachedOrgUsers;
  },
});

function RouteComponent() {
  const { organizationUsers } = useOrganizationSwitcher();

  const [activeOrganization, setActiveOrganization] = useAtom(
    activeOrganizationAtom,
  );

  if (!activeOrganization) {
    setActiveOrganization(organizationUsers[0]?.organization);
  }

  return <Outlet />;
}
