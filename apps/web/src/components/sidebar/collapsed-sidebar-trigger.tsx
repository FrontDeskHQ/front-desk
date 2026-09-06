import { useSyncExternalStore } from "react";
import { SidebarTrigger, useSidebar } from "@workspace/ui/components/sidebar";
import { cn } from "@workspace/ui/lib/utils";

import { workspaceNavHandle } from "./workspace-nav";

export function CollapsedSidebarTrigger({ className }: { className?: string }) {
  const { handle, isMobile, open, openMobile } = useSidebar(workspaceNavHandle);
  const dragCollapsed = useSyncExternalStore(
    handle.subscribeDragCollapsed,
    handle.getDragCollapsed,
    () => false
  );

  if (isMobile ? openMobile : open && !dragCollapsed) {
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
