import { useLiveQuery } from "@live-state/sync/client";
import { getRouteApi, Link, useMatches } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar";
import { useAtomValue } from "jotai/react";
import {
  ArrowLeft,
  Banknote,
  Cable,
  Code2,
  Settings,
  Tag,
  UserRoundPen,
  Users,
} from "lucide-react";
import { FirstStepsChecklist } from "~/components/onboarding/first-steps-checklist";
import { activeOrganizationAtom } from "~/lib/atoms";
import { query } from "~/lib/live-state";

const groups: {
  title: string;
  items: {
    title: string;
    url: string;
    icon: React.ComponentType<any>;
    role?: "owner" | "user";
  }[];
}[] = [
  {
    title: "Personal",
    items: [
      {
        title: "Profile",
        url: "/app/settings/user/",
        icon: UserRoundPen,
      },
    ],
  },
  {
    title: "Organization",
    items: [
      {
        title: "General",
        url: "/app/settings/organization/",
        icon: Settings,
      },
      {
        title: "Members",
        url: "/app/settings/organization/team",
        icon: Users,
      },
      {
        title: "Labels",
        url: "/app/settings/organization/labels",
        icon: Tag,
      },
      {
        title: "Integrations",
        url: "/app/settings/organization/integration",
        icon: Cable,
      },
      {
        title: "Billing",
        url: "/app/settings/organization/billing",
        icon: Banknote,
        role: "owner",
      },
      {
        title: "API keys",
        url: "/app/settings/organization/api-keys",
        icon: Code2,
        role: "owner",
      },
    ],
  },
];

export function SettingsSidebar() {
  const matches = useMatches();

  const currentOrg = useAtomValue(activeOrganizationAtom);

  const route = getRouteApi("/app/_workspace");
  const { user } = route.useRouteContext();

  const selfOrgUser = useLiveQuery(
    query.organizationUser.first({
      organizationId: currentOrg?.id,
      enabled: true,
      userId: user?.id,
    }),
  );

  return (
    <Sidebar variant="inset" className="bg-none">
      <SidebarHeader className="bg-none">
        <SidebarMenuButton asChild className="w-fit">
          <Link to="/app">
            <ArrowLeft />
            <span>Back to app</span>
          </Link>
        </SidebarMenuButton>
        {/* <NavMain items={data.navMain} /> */}
      </SidebarHeader>
      <SidebarContent className="bg-none">
        {groups.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items
                  .filter(
                    (item) => !item.role || item.role === selfOrgUser?.role,
                  )
                  .map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        data-active={matches.some(
                          (match) => match.pathname === item.url,
                        )}
                      >
                        <Link to={item.url}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        {/* <NavFavorites favorites={data.favorites} /> */}
        {/* <NavWorkspaces workspaces={data.workspaces} /> */}
        {/* <NavSecondary items={data.navSecondary} className="mt-auto" /> */}
      </SidebarContent>
      <SidebarFooter>
        <FirstStepsChecklist />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
