import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/_workspace/_main/threads/archive")({
  component: () => <Outlet />,
  staticData: {
    breadcrumb: "Archive",
  },
});
