import type { InferLiveObject } from "@live-state/sync";
import { ReflagClientProvider } from "@reflag/react-sdk";
import {
  createFileRoute,
  Link,
  notFound,
  Outlet,
  useMatches,
  useRouter,
} from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { ButtonGroup } from "@workspace/ui/components/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Logo } from "@workspace/ui/components/logo";
import { Navbar } from "@workspace/ui/components/navbar";
import type { schema } from "api/schema";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { useEffect } from "react";
import { CreateThreadDialog } from "~/components/threads/create-thread-dialog";
import { reflagClient } from "~/lib/feature-flag";
import { fetchClient } from "~/lib/live-state";
import { portalAuthClient } from "~/lib/portal-auth-client";
import {
  type GetSupportAuthUserResponse,
  getPortalAuthUser,
} from "~/lib/server-funcs/get-portal-auth-user";
import { getTenantBaseApiUrl } from "~/lib/urls";
import { safeParseJSON } from "~/utils/json";

export type WindowWithCachedPortalAuthUser = Window & {
  cachedPortalAuthUser?: GetSupportAuthUserResponse;
  cachedOrganization?: InferLiveObject<typeof schema.organization>;
};

export const Route = createFileRoute("/support/$slug")({
  // component: RouteComponent,
  beforeLoad: async ({ params }) => {
    const { slug } = params;

    let portalSessionData =
      typeof window !== "undefined"
        ? (window as WindowWithCachedPortalAuthUser).cachedPortalAuthUser
        : undefined;

    let organizationData =
      typeof window !== "undefined"
        ? (window as WindowWithCachedPortalAuthUser).cachedOrganization
        : undefined;

    if (portalSessionData && organizationData) {
      return {
        portalSession: portalSessionData,
        organization: organizationData,
      };
    }

    const [newPortalSessionData, newOrganizationData] = await Promise.all([
      getPortalAuthUser(),
      fetchClient.query.organization.first({ slug: slug }).get(),
    ]);

    portalSessionData = newPortalSessionData;
    organizationData = newOrganizationData;

    if (typeof window !== "undefined") {
      (window as WindowWithCachedPortalAuthUser).cachedPortalAuthUser =
        portalSessionData;
      (window as WindowWithCachedPortalAuthUser).cachedOrganization =
        organizationData;
    }

    if (!organizationData) {
      throw notFound();
    }

    return {
      portalSession: portalSessionData,
      organization: organizationData,
    };
  },
  component: () => {
    const { portalSession, organization } = Route.useRouteContext();
    const { slug } = Route.useParams();
    const router = useRouter();
    const matches = useMatches();

    const discordUrl = safeParseJSON(organization.socials)?.discord;

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
        <main className="w-full">
          <Navbar className="relative">
            <Navbar.Group>
              <Link
                to="/support/$slug"
                params={{ slug: organization.slug }}
                className="flex items-center gap-2"
              >
                <Avatar
                  fallback={organization.name}
                  src={organization.logoUrl}
                  variant="org"
                  size="lg"
                />
                <Logo.Text>{organization.name}</Logo.Text>
              </Link>
              <Navbar.LinkGroup className="ml-6">
                <Navbar.LinkItem
                  active={matches.some(
                    (match) =>
                      match.pathname === `/support/${slug}/threads` ||
                      match.pathname === `/support/${slug}/threads/`,
                  )}
                  size="sm"
                  render={
                    <Link
                      to="/support/$slug/threads"
                      params={{ slug: organization.slug }}
                    >
                      Threads
                    </Link>
                  }
                />
              </Navbar.LinkGroup>
            </Navbar.Group>
            <Navbar.Group>
              <ButtonGroup>
                <CreateThreadDialog
                  organization={organization}
                  portalSession={portalSession}
                />
                {!!discordUrl && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-sm" aria-label="More Options">
                        <ChevronDown />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-xs text-foreground-secondary">
                          Join us
                        </DropdownMenuLabel>
                        <DropdownMenuItem asChild>
                          <a
                            href={discordUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Discord
                            <ArrowUpRight className="size-4 ml-auto" />
                          </a>
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </ButtonGroup>
              {portalSession?.user && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-ring rounded-full select-none relative transition after:transition after:absolute after:inset-0 after:rounded-full after:pointer-events-none after:opacity-0 hover:after:opacity-100 hover:after:bg-foreground-primary/5"
                      aria-label="User menu"
                    >
                      <Avatar
                        variant="user"
                        size="lg"
                        fallback={portalSession.user.name}
                        src={portalSession.user.image}
                      />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={8}>
                    <DropdownMenuItem
                      onSelect={() =>
                        portalAuthClient.signOut({
                          fetchOptions: {
                            baseURL: `${getTenantBaseApiUrl({
                              slug: organization?.slug ?? "",
                            })}/api/portal-auth`,
                            onSuccess: () => {
                              (
                                window as WindowWithCachedPortalAuthUser
                              ).cachedPortalAuthUser = null;
                              router.invalidate();
                            },
                          },
                        })
                      }
                    >
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </Navbar.Group>
          </Navbar>
          <Outlet />
          <footer className="w-full py-6 flex justify-center items-center">
            <a
              href="https://tryfrontdesk.app"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Visit FrontDesk website"
            >
              <span className="mr-1">Powered by</span>
              <Logo.Icon className="size-4" />
              FrontDesk
            </a>
          </footer>
        </main>
      </ReflagClientProvider>
    );
  },
});
