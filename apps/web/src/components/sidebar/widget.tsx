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
      trigger={{
        className:
          "dark:bg-background-secondary dark:hover:bg-background-tertiary left-4 bottom-4 size-7 p-0 [&_svg]:size-4!",
      }}
    />
  );
}
