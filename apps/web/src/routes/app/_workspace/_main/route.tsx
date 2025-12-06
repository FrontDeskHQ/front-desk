import { FrontDesk } from "@front-desk/sdk";
import { Widget } from "@front-desk/widget";
import { useFlag } from "@reflag/react-sdk";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Card } from "@workspace/ui/components/card";
import { BookMarked, MessageCircleQuestion } from "lucide-react";
import { AppSidebar } from "~/components/sidebar/app-sidebar";

export const Route = createFileRoute("/app/_workspace/_main")({
  component: RouteComponent,
});

const frontdeskClient = new FrontDesk({
  publicKey: import.meta.env.VITE_FRONTDESK_PUBLIC_KEY,
});

function RouteComponent() {
  const { user } = Route.useRouteContext();
  const { isEnabled: isWidgetEnabled } = useFlag("widget");

  return (
    <div className="w-screen h-screen flex overflow-hidden">
      <AppSidebar />
      <Card className="flex-1 relative m-2 ml-0 h-auto">
        <Outlet />
      </Card>

      {isWidgetEnabled && (
        <Widget
          customer={{
            id: user?.id,
            name: user?.name,
          }}
          sdk={frontdeskClient}
          position="bottom-left"
          resourcesGroups={[
            {
              title: "Other links",
              items: [
                {
                  title: "Documentation",
                  link: "https://tryfrontdesk.app/docs",
                  content: "Documentation",
                  icon: <BookMarked />,
                },
                {
                  title: "Discord",
                  link: "https://discord.gg/5MDHqKHrHr",
                  content: "Discord",
                  icon: <MessageCircleQuestion />,
                },
              ],
            },
          ]}
        />
      )}
    </div>
  );
}
