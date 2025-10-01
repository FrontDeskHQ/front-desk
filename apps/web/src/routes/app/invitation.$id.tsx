import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/invitation/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/app/invitation/$id"!</div>;
}
