import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/_workspace/settings/organization")({
  component: () => <Outlet />,
  staticData: {
    breadcrumb: "Organization",
  },
});
