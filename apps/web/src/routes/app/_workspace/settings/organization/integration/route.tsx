import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/integration"
)({
  component: () => <Outlet />,
  staticData: {
    breadcrumb: "Integrations",
  },
});
