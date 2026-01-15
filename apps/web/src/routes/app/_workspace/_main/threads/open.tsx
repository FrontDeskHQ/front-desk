import { createFileRoute } from "@tanstack/react-router";
import { seo } from "~/utils/seo";
import { ThreadsList } from "./index";

export const Route = createFileRoute("/app/_workspace/_main/threads/open")({
  component: RouteComponent,
  head: () => {
    return {
      meta: [
        ...seo({
          title: "Open Threads - FrontDesk",
          description: "View open support threads",
        }),
      ],
    };
  },
});

function RouteComponent() {
  return (
    <ThreadsList
      subTitle="Open"
      fixedFilters={{
        status: { $not: { $in: [2, 3] } }, // Exclude Resolved (2) and Closed (3)
      }}
    />
  );
}
