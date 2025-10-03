import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/_workspace/invitation/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/app/invitation/$id"!</div>;
}
