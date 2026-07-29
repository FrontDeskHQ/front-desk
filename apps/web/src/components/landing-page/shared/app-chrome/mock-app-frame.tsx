/* mirror: workspace main chrome — apps/web/src/routes/app/_workspace/_main/route.tsx
 * fork: apps/web/src/routes/app/_workspace/_main/route.tsx @ 59006b69
 *   why: composes live AppSidebar + Widget; mock swaps in MockSidebar, drops Widget
 * reuse: SidebarProvider, MockSidebar
 * state: active sidebar item from props; children fill the main Card slot
 * marketing: none — ProductMockFrame owns the design canvas, inert and role=img
 */

import { SidebarProvider } from "@workspace/ui/components/sidebar";
import type * as React from "react";

import type { MockSidebarActive } from "./mock-sidebar";
import { MockSidebar } from "./mock-sidebar";

interface MockAppFrameProps {
  children: React.ReactNode;
  activeSidebarItem?: MockSidebarActive;
}

export function MockAppFrame({
  children,
  activeSidebarItem = "threads",
}: MockAppFrameProps) {
  return (
    <SidebarProvider className="min-h-0 h-full overflow-hidden">
      <div className="flex size-full overflow-hidden">
        <MockSidebar active={activeSidebarItem} />
        {children}
      </div>
    </SidebarProvider>
  );
}
