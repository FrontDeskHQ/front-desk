import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/_workspace/settings/user")({
  component: () => <Outlet />,
  staticData: {
    breadcrumb: "Profile",
  },
});
