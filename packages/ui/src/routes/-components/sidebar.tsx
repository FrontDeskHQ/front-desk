import { Link, useMatches } from "@tanstack/react-router";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar";
import { ThemeSwitcher } from "@workspace/ui/components/theme-switcher";
import { cn } from "@workspace/ui/lib/utils";
import { ChevronRight } from "lucide-react";

const navSectionTriggerClassName = cn(
  "text-sidebar-foreground/70 ring-sidebar-ring flex h-8 w-full shrink-0 items-center gap-2 rounded-md px-2 text-left text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-linear hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2",
  "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
  "data-[state=open]:[&>svg]:rotate-90",
);

const NavSectionChevron = () => (
  <ChevronRight className="size-4 shrink-0 transition-transform" aria-hidden />
);

export const RootSidebar = () => {
  const matches = useMatches();

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  data-active={matches.at(-1)?.pathname === "/"}
                  asChild
                >
                  <Link to="/">
                    <span>Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="py-0">
          <Collapsible defaultOpen>
            <CollapsibleTrigger
              type="button"
              className={navSectionTriggerClassName}
            >
              <NavSectionChevron />
              <span>Foundations</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden">
              <SidebarGroupContent className="pt-1">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      data-active={matches.at(-1)?.pathname === "/colors"}
                      asChild
                    >
                      <Link to="/colors">
                        <span>Colors</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        <SidebarGroup className="py-0">
          <Collapsible defaultOpen>
            <CollapsibleTrigger
              type="button"
              className={navSectionTriggerClassName}
            >
              <NavSectionChevron />
              <span>Components</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden">
              <SidebarGroupContent className="pt-1">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      data-active={matches.at(-1)?.pathname === "/buttons"}
                      asChild
                    >
                      <Link to="/button">
                        <span>Button</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      data-active={matches.at(-1)?.pathname === "/command"}
                      asChild
                    >
                      <Link to="/command">
                        <span>Command</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      data-active={
                        matches.at(-1)?.pathname === "/status-indicator"
                      }
                      asChild
                    >
                      <Link to="/status-indicator">
                        <span>Status Indicator</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      data-active={matches.at(-1)?.pathname === "/composite"}
                      asChild
                    >
                      <Link to="/composite">
                        <span>Composite</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      data-active={matches.at(-1)?.pathname === "/avatar"}
                      asChild
                    >
                      <Link to="/avatar">
                        <span>Avatar</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      data-active={matches.at(-1)?.pathname === "/toggle-group"}
                      asChild
                    >
                      <Link to="/toggle-group">
                        <span>Toggle Group</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      data-active={
                        matches.at(-1)?.pathname === "/segmented-control"
                      }
                      asChild
                    >
                      <Link to="/segmented-control">
                        <span>Segmented Control</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeSwitcher />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
