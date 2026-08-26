import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Card } from "@workspace/ui/components/card";

import { IntegrationWarningToast } from "~/components/integration-settings/integration-warning-toast";
import { AppSidebar } from "~/components/sidebar/app-sidebar";
import { CollapsedSidebarTrigger } from "~/components/sidebar/collapsed-sidebar-trigger";
import { Widget } from "~/components/sidebar/widget";

export const Route = createFileRoute("/app/_workspace/_main")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="w-screen h-full flex overflow-hidden">
      <AppSidebar />
      <Card className="flex-1 relative m-2 ml-0 h-auto overflow-hidden max-lg:ml-2 max-lg:**:data-[slot=card-header]:pl-12 [&:has([data-slot=collapsed-sidebar-trigger])]:ml-2 [&:has([data-slot=collapsed-sidebar-trigger])_[data-slot=card-header]]:pl-12">
        <CollapsedSidebarTrigger />
        <Outlet />
      </Card>
      <Widget />
      <IntegrationWarningToast />
    </div>
  );
}
