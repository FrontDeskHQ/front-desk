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

  if (!activeOrganization) {
    setActiveOrganization(organizationUsers[0]?.organization);
  }

  useEffect(() => {
    reflagClient.setContext({
      company: {
        id: organizationUsers[0]?.organization?.id,
        name: organizationUsers[0]?.organization?.name,
      },
    });
  }, [organizationUsers]);

  return { organizationUsers, activeOrganization, setActiveOrganization };
};
