import { SidebarProvider } from "@workspace/ui/components/sidebar";
import type * as React from "react";
import { MockSidebar } from "./mock-sidebar";

type MockAppFrameProps = {
  children: React.ReactNode;
  activeSidebarItem?: "threads";
  ariaLabel?: string;
  showSidebar?: boolean;
};

export const MockAppFrame = ({
  children,
  activeSidebarItem = "threads",
  ariaLabel = "FrontDesk app preview (non-interactive)",
  showSidebar = true,
}: MockAppFrameProps) => {
  return (
    <div
      className="w-full h-full flex overflow-hidden pointer-events-none select-none gap-2 bg-background-primary border"
      role="img"
      aria-label={ariaLabel}
    >
      <SidebarProvider>
        {showSidebar && <MockSidebar activeItem={activeSidebarItem} />}
        {children}
      </SidebarProvider>
    </div>
  );
};
