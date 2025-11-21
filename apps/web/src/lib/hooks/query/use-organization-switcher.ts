import { getRouteApi } from "@tanstack/react-router";
import { useAtom } from "jotai/react";
import { useEffect } from "react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { reflagClient } from "~/lib/feature-flag";

export const useOrganizationSwitcher = () => {
  const route = getRouteApi("/app/_workspace");
  const { organizationUsers } = route.useRouteContext();
  const [activeOrganization, setActiveOrganization] = useAtom(
    activeOrganizationAtom
  );

  useEffect(() => {
    if (!activeOrganization) {
      setActiveOrganization(organizationUsers[0]?.organization);
    }

    reflagClient.setContext({
      company: {
        id: activeOrganization?.id,
        name: activeOrganization?.name,
      },
    });
  }, [organizationUsers, activeOrganization]);

  return { organizationUsers, activeOrganization, setActiveOrganization };
};
