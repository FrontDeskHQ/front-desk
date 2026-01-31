import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { seo } from "~/utils/seo";
import { ThreadsList } from "./index";

export const Route = createFileRoute("/app/_workspace/_main/threads/assigned")({
  component: RouteComponent,
  head: () => {
    return {
      meta: [
        ...seo({
          title: "Assigned Threads - FrontDesk",
          description: "View threads assigned to you",
        }),
      ],
    };
  },
});

function RouteComponent() {
  const { user } = getRouteApi("/app").useRouteContext();

  return (
    <ThreadsList
      subTitle="Assigned to me"
      fixedFilters={{
        assignedUserId: user.id,
      }}
    />
  );
}
