import { ReflagClientProvider } from "@reflag/react-sdk";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { reflagClient } from "~/lib/feature-flag";
import {
  type GetSupportAuthUserResponse,
  getPortalAuthUser,
} from "~/lib/server-funcs/get-portal-auth-user";

export type WindowWithCachedPortalAuthUser = Window & {
  cachedPortalAuthUser?: GetSupportAuthUserResponse;
};

export const Route = createFileRoute("/support/$slug")({
  // component: RouteComponent,
  beforeLoad: async () => {
    let portalSessionData =
      typeof window !== "undefined"
        ? (window as WindowWithCachedPortalAuthUser).cachedPortalAuthUser
        : undefined;

    if (portalSessionData !== undefined) {
      return { portalSession: portalSessionData };
    }

    portalSessionData = await getPortalAuthUser();

    if (typeof window !== "undefined") {
      (window as WindowWithCachedPortalAuthUser).cachedPortalAuthUser =
        portalSessionData;
    }

    return { portalSession: portalSessionData };
  },
  component: () => {
    const { slug } = Route.useParams();

    useEffect(() => {
      (async () => {
        await reflagClient.initialize();
        await reflagClient.setContext({
          company: {
            id: slug,
            name: slug,
          },
        });
      })();
    }, [slug]);

    return (
      <ReflagClientProvider client={reflagClient}>
        <Outlet />
      </ReflagClientProvider>
    );
  },
});
