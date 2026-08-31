import { SidebarTrigger, useSidebar } from "@workspace/ui/components/sidebar";
import { cn } from "@workspace/ui/lib/utils";

import { workspaceNavHandle } from "./workspace-nav";

export function CollapsedSidebarTrigger({ className }: { className?: string }) {
  const { isMobile, open, openMobile } = useSidebar(workspaceNavHandle);

  if (isMobile ? openMobile : open) {
    return null;
  }

  return (
    <SidebarTrigger
      handle={workspaceNavHandle}
      data-slot="nav-sidebar-trigger"
      className={cn("shrink-0", className)}
    />
  );
}
