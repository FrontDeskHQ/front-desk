import { Avatar } from "@workspace/ui/components/avatar";
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
import {
  Book,
  ChevronDown,
  MessageCircleQuestion,
  MessagesSquare,
} from "lucide-react";

type MockSidebarProps = {
  activeItem?: "threads";
};

export const MockSidebar = ({ activeItem = "threads" }: MockSidebarProps) => {
  return (
    <Sidebar
      variant="inset"
      className="bg-background-primary p-2"
      collapsible="none"
    >
      <SidebarHeader className="bg-none">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="w-fit px-1.5 select-none"
              aria-label="Organization switcher (demo)"
            >
              <Avatar variant="org" size="lg" fallback="A" />
              <span className="truncate font-semibold">Acme Inc.</span>
              <ChevronDown className="opacity-50" aria-hidden="true" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="bg-none">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={activeItem === "threads"}>
                  <div>
                    <MessagesSquare aria-hidden="true" />
                    <span>Threads</span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarFooter>
          <SidebarMenuButton asChild>
            <div>
              <Book aria-hidden="true" />
              <span>Docs</span>
            </div>
          </SidebarMenuButton>
          <SidebarMenuButton asChild>
            <div>
              <MessageCircleQuestion aria-hidden="true" />
              <span>Support</span>
            </div>
          </SidebarMenuButton>
        </SidebarFooter>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
};
