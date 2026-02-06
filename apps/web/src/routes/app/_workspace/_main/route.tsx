import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Card } from "@workspace/ui/components/card";
import { IntegrationWarningToast } from "~/components/integration-settings/integration-warning-toast";
import { AppSidebar } from "~/components/sidebar/app-sidebar";
import { Widget } from "~/components/sidebar/widget";

export const Route = createFileRoute("/app/_workspace/_main")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="w-screen h-full flex overflow-hidden">
      <AppSidebar />
      <Card className="flex-1 relative m-2 ml-0 h-auto overflow-hidden">
        <Outlet />
      </Card>
      <Widget />
      <IntegrationWarningToast />
    </div>
  );
}
