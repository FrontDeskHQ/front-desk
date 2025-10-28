import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/_workspace/_main/")({
  component: RouteComponent,
  loader: () => {
    throw redirect({
      to: "/app/threads",
    });
  },
});

function RouteComponent() {
  return null;
}
