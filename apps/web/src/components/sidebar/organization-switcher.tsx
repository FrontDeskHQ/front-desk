import { Link } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar";
import { useAtom } from "jotai/react";
import { ChevronDown } from "lucide-react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { useLogout } from "~/lib/hooks/auth";
import { useOrganizationSwitcher } from "~/lib/hooks/query/use-organization-switcher";

export function OrgSwitcher() {
  const { organizationUsers } = useOrganizationSwitcher();

  const [activeOrganization, setActiveOrganization] = useAtom(
    activeOrganizationAtom,
  );

  const logout = useLogout();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="w-fit px-1.5 select-none">
              <Avatar
                variant="org"
                size="lg"
                src={activeOrganization?.logoUrl}
                fallback={activeOrganization?.name}
              />
              <span className="truncate font-semibold">
                {
                  (
                    activeOrganization ??
                    Object.values(organizationUsers)[0].organization
                  ).name
                }
              </span>
              <ChevronDown className="opacity-50" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-64 rounded-lg text-muted-foreground"
            align="start"
            side="bottom"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Organizations
            </DropdownMenuLabel>
            {Object.entries(organizationUsers).map(([id, userOrg], index) => (
              <DropdownMenuItem
                key={id}
                onSelect={() =>
                  setActiveOrganization(userOrg.organization as any)
                }
                className="gap-2 p-2"
              >
                <Avatar
                  variant="org"
                  size="lg"
                  className="size-6"
                  src={userOrg.organization.logoUrl}
                  fallback={userOrg.organization.name}
                />
                {userOrg.organization.name}
                {/* TODO: Bind keyboard shortcut */}
                <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2" asChild>
              <Link to="/app/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 p-2" onClick={logout}>
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
