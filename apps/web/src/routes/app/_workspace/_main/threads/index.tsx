import { useLiveQuery } from "@live-state/sync/client";
import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai/react";
import { ThreadsCard } from "~/components/threads/threads-card";
import { activeOrganizationAtom } from "~/lib/atoms";
import { query } from "~/lib/live-state";

export const Route = createFileRoute("/app/_workspace/_main/threads/")({
  component: RouteComponent,
});

function RouteComponent() {
  const currentOrg = useAtomValue(activeOrganizationAtom) || undefined;

  const organization = useLiveQuery(
    query.organization.where({ id: currentOrg?.id }).include({ threads: true }),
  )?.[0];

  return <ThreadsCard organization={organization} />;
}
