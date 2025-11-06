import type { InferLiveObject } from "@live-state/sync";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import type { schema } from "api/schema";
import { useAtom } from "jotai/react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { useOrganizationSwitcher } from "~/lib/hooks/query/use-organization-switcher";
import { fetchClient } from "~/lib/live-state";

export const Route = createFileRoute("/app/_workspace")({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    let orgUsers = (
      window as
        | {
            cachedOrgUsers?: {
              organizationUsers: InferLiveObject<
                (typeof schema)["organizationUser"],
                { organization: true }
              >[];
            };
          }
        | undefined
    )?.cachedOrgUsers;

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
      (
        window as {
          cachedOrgUsers?: {
            organizationUsers: InferLiveObject<
              (typeof schema)["organizationUser"],
              { organization: true }
            >[];
          };
        }
      ).cachedOrgUsers = orgUsers;
    }

    return orgUsers;
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
