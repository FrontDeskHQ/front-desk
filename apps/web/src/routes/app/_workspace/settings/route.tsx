import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Card } from "@workspace/ui/components/card";

import { CollapsedSidebarTrigger } from "~/components/sidebar/collapsed-sidebar-trigger";
import { SettingsSidebar } from "~/components/sidebar/settings-sidebar";
import { Widget } from "~/components/sidebar/widget";

export const Route = createFileRoute("/app/_workspace/settings")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="w-screen h-full flex overflow-hidden">
      <SettingsSidebar />
      <Card className="flex-1 bg-muted/30 relative m-2 ml-0 h-auto p-4 max-lg:ml-2 max-lg:**:data-[slot=card-header]:pl-12 [&:has([data-slot=collapsed-sidebar-trigger])]:ml-2 [&:has([data-slot=collapsed-sidebar-trigger])_[data-slot=card-header]]:pl-12">
        <CollapsedSidebarTrigger />
        <div className="max-w-3xl mx-auto w-full flex flex-col">
          <Outlet />
        </div>
      </Card>
      <Widget />
    </div>
  );
}
