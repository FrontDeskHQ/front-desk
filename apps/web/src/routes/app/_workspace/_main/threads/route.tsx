import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/_workspace/_main/threads")({
  component: () => <Outlet />,
  staticData: {
    breadcrumb: "Threads",
  },
});
