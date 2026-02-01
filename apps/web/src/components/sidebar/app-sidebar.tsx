import { useFlag } from "@reflag/react-sdk";
import { Link, useMatches } from "@tanstack/react-router";
import { ActionButton } from "@workspace/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar";
import { Activity, MessagesSquare, Search } from "lucide-react";
import { OrgSwitcher } from "./organization-switcher";

interface Item {
  title: string;
  url: string;
  route: string;
  icon?: React.ComponentType<Record<string, never>>;
  items?: Item[];
  collapsible?: boolean;
}

const items: Item[] = [
  {
    title: "Signals",
    url: "/app/signal/",
    route: "/app/_workspace/_main/signal/",
    icon: Activity,
  },
  {
    title: "Threads",
    url: "/app/threads/",
    route: "/app/_workspace/_main/threads/",
    icon: MessagesSquare,
    items: [
      {
        title: "Open",
        url: "/app/threads/open",
        route: "/app/_workspace/_main/threads/open",
      },
      {
        title: "Assigned to me",
        url: "/app/threads/assigned",
        route: "/app/_workspace/_main/threads/assigned",
      },
    ],
  },
];

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const matches = useMatches();

  const { isEnabled: isSearchEnabled } = useFlag("in-app-search");

  return (
    <Sidebar variant="inset" className="bg-none" {...props}>
      <SidebarHeader className="bg-none flex-row">
        <OrgSwitcher />
        {isSearchEnabled && (
          <ActionButton
            variant="ghost"
            size="icon"
            tooltip="Search"
            render={<Link to="/app/search" />}
          >
            <Search />
          </ActionButton>
        )}
        {/* <NavMain items={data.navMain} /> */}
      </SidebarHeader>
      <SidebarContent className="bg-none">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={matches.some(
                      (match) => match.routeId === item.route,
                    )}
                  >
                    <Link to={item.url}>
                      {item.icon && <item.icon />}
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.items && item.items.length > 0 && (
                    <SidebarMenuSub>
                      {item.items.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={matches.some(
                              (match) => match.routeId === subItem.route,
                            )}
                          >
                            <Link to={subItem.url}>
                              {subItem.icon && <subItem.icon />}
                              <span>{subItem.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {/* <NavFavorites favorites={data.favorites} /> */}
        {/* <NavWorkspaces workspaces={data.workspaces} /> */}
        {/* <NavSecondary items={data.navSecondary} className="mt-auto" /> */}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
