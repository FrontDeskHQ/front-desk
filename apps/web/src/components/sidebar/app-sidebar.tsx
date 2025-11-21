import { useFlag } from "@reflag/react-sdk";
import { Link, useMatches } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar";
import { Book, MessageCircleQuestion, MessagesSquare } from "lucide-react";
import { OrgSwitcher } from "./organization-switcher";

const items: { title: string; url: string; icon: React.ComponentType<any> }[] =
  [
    {
      title: "Threads",
      url: "/app/threads/",
      icon: MessagesSquare,
    },
  ];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const matches = useMatches();

  const { isEnabled: isWidgetEnabled, config } = useFlag("widget");

  return (
    <Sidebar variant="inset" className="bg-none">
      <SidebarHeader className="bg-none">
        <OrgSwitcher />
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
        {/* <NavFavorites favorites={data.favorites} /> */}
        {/* <NavWorkspaces workspaces={data.workspaces} /> */}
        {/* <NavSecondary items={data.navSecondary} className="mt-auto" /> */}
        {!isWidgetEnabled && (
          <SidebarFooter>
            <SidebarMenuButton asChild>
              <a href="/docs" target="_blank" rel="noopener noreferrer">
                <Book />
                Docs
              </a>
            </SidebarMenuButton>
            <SidebarMenuButton asChild>
              <a
                href="https://discord.gg/5MDHqKHrHr"
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircleQuestion />
                Support
              </a>
            </SidebarMenuButton>
          </SidebarFooter>
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
