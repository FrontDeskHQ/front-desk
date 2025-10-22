import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai/react";
import { ThreadsCard } from "~/components/threads/threads-card";
import { activeOrganizationAtom } from "~/lib/atoms";

export const Route = createFileRoute("/app/_workspace/_main/threads/")({
  component: RouteComponent,
});

function RouteComponent() {
  const organizationId = useAtomValue(activeOrganizationAtom)?.id;

  return <ThreadsCard organizationId={organizationId} />;
}
