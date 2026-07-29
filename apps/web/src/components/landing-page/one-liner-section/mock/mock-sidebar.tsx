/* mirror: app sidebar — apps/web/src/components/sidebar/app-sidebar.tsx
 * fork: apps/web/src/components/sidebar/app-sidebar.tsx @ 59006b69
 *   why: useMatches, Link, useFlag("in-app-search")
 * fork: apps/web/src/components/sidebar/organization-switcher.tsx @ 59006b69
 *   why: jotai org atom, auth logout, org switcher hook, PostHog
 * reuse: Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarMenu*,
 *   SidebarRail, Avatar
 * state: Acme org; Signals active only on signals page; no nav highlight on thread view;
 *   Threads Open + Assigned to me subs always shown
 * marketing: collapsible=none + p-2 so inset chrome survives below md viewport
 *   (real inset uses md:flex; media queries follow the page, not the 1280 design canvas).
 *   bg-transparent overrides the collapsible=none hard-coded bg-sidebar — real inset
 *   desktop path is transparent (bg-inherit); bg-none only clears background-image.
 */

import { Avatar } from "@workspace/ui/components/avatar";
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
import { Activity, ChevronDown, MessagesSquare } from "lucide-react";

import { ORG } from "./data";
import type { FrontDeskPage } from "./types";

interface MockSidebarProps {
  active: FrontDeskPage;
}

export function MockSidebar({ active }: MockSidebarProps) {
  return (
    <Sidebar variant="inset" className="bg-transparent p-2" collapsible="none">
      <SidebarHeader className="bg-transparent flex-row">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="w-fit px-1.5 select-none">
              <div>
                <Avatar variant="org" fallback={ORG.name} />
                <span className="truncate font-semibold">{ORG.name}</span>
                <ChevronDown className="opacity-50" />
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="bg-transparent">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={active === "signals"}>
                  <div>
                    <Activity />
                    <span>Signals</span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <div>
                    <MessagesSquare />
                    <span>Threads</span>
                  </div>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild>
                      <div>
                        <span>Open</span>
                      </div>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild>
                      <div>
                        <span>Assigned to me</span>
                      </div>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
