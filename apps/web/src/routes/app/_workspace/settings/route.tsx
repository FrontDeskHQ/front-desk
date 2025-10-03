import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Card } from "@workspace/ui/components/card";
import { SettingsSidebar } from "~/components/sidebar/settings-sidebar";

export const Route = createFileRoute("/app/_workspace/settings")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="w-screen h-screen flex overflow-hidden">
      <SettingsSidebar />
      <Card className="flex-1 bg-muted/30 relative m-2 ml-0 h-auto p-4">
        <Outlet />
      </Card>
    </div>
  );
}
