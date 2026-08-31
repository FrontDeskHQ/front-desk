import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Card, CardHeader } from "@workspace/ui/components/card";

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
      <Card className="flex-1 bg-muted/30 relative m-2 ml-0 h-auto p-4 max-lg:ml-2 lg:peer-data-[state=collapsed]:ml-2">
        <CardHeader className="px-0 border-b-0 h-auto pb-4">
          <CollapsedSidebarTrigger />
        </CardHeader>
        <div className="max-w-3xl mx-auto w-full flex flex-col">
          <Outlet />
        </div>
      </Card>
      <Widget />
    </div>
  );
}
