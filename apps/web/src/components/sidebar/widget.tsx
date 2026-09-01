import { FrontDesk } from "@front-desk/sdk";
import { Widget as FrontDeskWidget } from "@front-desk/widget";
import { getRouteApi } from "@tanstack/react-router";
import { BookMarked, MessageCircleQuestion } from "lucide-react";

const frontdeskClient = new FrontDesk({
  publicKey: import.meta.env.VITE_FRONTDESK_PUBLIC_KEY,
});

export function Widget() {
  const { user } = getRouteApi("/app/_workspace").useRouteContext();

  return (
    <FrontDeskWidget
      customer={{
        id: user?.id,
        name: user?.name,
      }}
      sdk={frontdeskClient}
      position="bottom-left"
      resourcesGroups={[
        {
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
          title: "Other links",
        },
      ]}
      trigger={{
        className:
          "relative top-auto right-auto bottom-auto left-auto z-10 size-6 shrink-0 p-0 shadow-none rounded-full border bg-card text-muted-foreground hover:text-foreground hover:bg-accent dark:bg-card dark:hover:bg-accent [&_svg]:size-3.5!",
      }}
    />
  );
}
