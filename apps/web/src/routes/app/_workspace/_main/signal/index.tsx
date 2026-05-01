import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import {
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { useAtomValue } from "jotai/react";
import { usePostHog } from "posthog-js/react";
import { useMemo } from "react";
import { ActionList } from "~/components/signals/action-list";
import type { ActorContext } from "~/components/signals/action-row";
import { NewOrgEmpty } from "~/components/signals/empty-states";
import { LeverageReport } from "~/components/signals/leverage-report";
import { activeOrganizationAtom } from "~/lib/atoms";

export const Route = createFileRoute("/app/_workspace/_main/signal/")({
  component: RouteComponent,
});

const NEW_ORG_DAY_THRESHOLD = 3;

function RouteComponent() {
  const { user } = getRouteApi("/app").useRouteContext();
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const posthog = usePostHog();

  const ctx = useMemo<ActorContext | null>(() => {
    if (!currentOrg) return null;
    return {
      user: { id: user.id, name: user.name },
      organizationId: currentOrg.id,
      posthog: posthog ?? null,
    };
  }, [currentOrg, user.id, user.name, posthog]);

  if (!currentOrg || !ctx) return null;

  const orgCreatedAt = currentOrg.createdAt
    ? new Date(currentOrg.createdAt)
    : null;
  const orgDaysOld = orgCreatedAt
    ? (Date.now() - orgCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
    : null;
  const isNewOrg = orgDaysOld != null && orgDaysOld < NEW_ORG_DAY_THRESHOLD;

  return (
    <>
      <CardHeader>
        <CardTitle>Signals</CardTitle>
      </CardHeader>
      <CardContent className="overflow-y-auto">
        {!isNewOrg && (
          <LeverageReport
            organizationId={currentOrg.id}
            organizationCreatedAt={orgCreatedAt}
            userId={user.id}
            posthog={posthog ?? null}
          />
        )}

        {isNewOrg ? (
          <NewOrgEmpty />
        ) : (
          <ActionList organizationId={currentOrg.id} ctx={ctx} />
        )}
      </CardContent>
    </>
  );
}
