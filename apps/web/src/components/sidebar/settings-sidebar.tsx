import { Link, useMatches } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar";
import { ArrowLeft, Settings, Users } from "lucide-react";

const groups: {
  title: string;
  items: { title: string; url: string; icon: React.ComponentType<any> }[];
}[] = [
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
    ],
  },
];

export function SettingsSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const matches = useMatches();

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
                {group.items.map((item) => (
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
      <SidebarRail />
    </Sidebar>
  );
}
