import { createFileRoute } from "@tanstack/react-router";
import { statusValues } from "@workspace/ui/components/indicator";
import { seo } from "~/utils/seo";
import { ThreadsList } from "./index";

const STATUS_RESOLVED =
  Number(
    Object.entries(statusValues).find(
      ([, value]) => value.label === "Resolved",
    )?.[0],
  ) ?? 2;
const STATUS_CLOSED =
  Number(
    Object.entries(statusValues).find(
      ([, value]) => value.label === "Closed",
    )?.[0],
  ) ?? 3;

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
        status: { $not: { $in: [STATUS_RESOLVED, STATUS_CLOSED] } },
      }}
    />
  );
}
