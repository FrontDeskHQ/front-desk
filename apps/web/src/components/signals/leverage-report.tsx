import { useLiveQuery } from "@live-state/sync/client";
import { Link } from "@tanstack/react-router";
import {
  SIGNAL_REPORT_VERB,
  signalTypeFromStored,
  type SignalType,
} from "@workspace/schemas/signals";
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import type { PostHog } from "posthog-js";
import { useEffect, useMemo } from "react";
import { query } from "~/lib/live-state";
import {
  markSnapshotSeenThisSession,
  markVisited,
  readSignalsVisit,
} from "~/lib/signals-visit";

const NEW_ORG_DAY_THRESHOLD = 3;
const NEW_ORG_ACTION_THRESHOLD = 5;

type Props = {
  organizationId: string;
  organizationCreatedAt: Date | null;
  userId: string;
  posthog: PostHog | null;
};

export function LeverageReport({
  organizationId,
  organizationCreatedAt,
  userId,
  posthog,
}: Props) {
  const allActions = useLiveQuery(
    query.autonomousAction.where({ organizationId, undoneAt: null }),
  );

  // Snapshot the visit state. Recomputes if the user switches workspaces or
  // accounts without remounting; otherwise stable for the lifetime of the view.
  const visit = useMemo(
    () => readSignalsVisit(organizationId, userId),
    [organizationId, userId],
  );
  const [windowStart, mode] = useMemo(() => {
    const now = Date.now();
    const previous = visit.previousVisitAt?.getTime() ?? null;
    if (previous && !visit.seenThisSession) {
      return [new Date(previous), "since-visit" as const];
    }
    return [new Date(now - 24 * 60 * 60 * 1000), "last-24h" as const];
  }, [visit]);

  const orgDaysOld = useMemo(() => {
    if (!organizationCreatedAt) return null;
    return (Date.now() - organizationCreatedAt.getTime()) / (1000 * 60 * 60 * 24);
  }, [organizationCreatedAt]);

  // "Since visit" uses previousVisitAt; if the user comes back soon, that window
  // can be seconds wide and show nothing even when recent history exists. Fall
  // back to last 24h in that case only.
  const { inWindow, reportWindowStart, effectiveHeadingMode } = useMemo(() => {
      const now = Date.now();
      const last24hStart = new Date(now - 24 * 60 * 60 * 1000);
      const filterFromStart = (start: Date) =>
        allActions
          ? allActions.filter(
              (a) => new Date(a.appliedAt).getTime() >= start.getTime(),
            )
          : [];

      const primary = filterFromStart(windowStart);
      if (
        primary.length === 0 &&
        (allActions?.length ?? 0) > 0 &&
        mode === "since-visit"
      ) {
        return {
          inWindow: filterFromStart(last24hStart),
          reportWindowStart: last24hStart,
          effectiveHeadingMode: "last-24h" as const,
        };
      }
      return {
        inWindow: primary,
        reportWindowStart: windowStart,
        effectiveHeadingMode: mode,
      };
    }, [allActions, windowStart, mode]);

  const isNewOrg =
    (orgDaysOld == null || orgDaysOld < NEW_ORG_DAY_THRESHOLD) &&
    (allActions?.length ?? 0) < NEW_ORG_ACTION_THRESHOLD;

  const isRenderable = !!allActions && !isNewOrg && inWindow.length > 0;

  // After a brief delay, always bump the persisted lastVisit so the next
  // session's "since last visit" window starts from now (the user effectively
  // saw whatever was — or wasn't — there). Only flip the session-seen flag
  // when the report actually rendered, since that flag's only purpose is to
  // make a same-tab refresh switch from "since-visit" to "last 24h".
  useEffect(() => {
    const t = setTimeout(() => {
      if (isRenderable) markSnapshotSeenThisSession(organizationId, userId);
      markVisited(organizationId, userId);
    }, 2000);
    return () => clearTimeout(t);
  }, [isRenderable, organizationId, userId]);

  if (!allActions) return <LeverageReport.Skeleton />;

  // Hide on truly new orgs.
  if (isNewOrg) return null;

  const grouped = new Map<SignalType, number>();
  for (const a of inWindow) {
    const t = signalTypeFromStored(a.signalType);
    if (!t) continue;
    grouped.set(t, (grouped.get(t) ?? 0) + 1);
  }

  const total = inWindow.length;
  const heading =
    effectiveHeadingMode === "since-visit" && visit.previousVisitAt
      ? `Since your last visit · ${formatRelativeTime(visit.previousVisitAt)}`
      : "Last 24 hours";

  if (total === 0) {
    // Hide the whole card when there's nothing to show in the window
    // (avoids "FrontDesk handled 0 things" on quiet stretches).
    return null;
  }

  return (
    <Collapsible defaultOpen>
      <Card>
        <CardHeader size="sm">
          <CollapsibleTrigger
            onClick={() =>
              posthog?.capture("signal:report_expanded", {
                organization_id: organizationId,
              })
            }
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <div className="flex flex-col gap-0.5">
              <div className="text-foreground-secondary text-xs">{heading}</div>
              <div className="text-foreground-primary text-sm font-medium">
                FrontDesk handled {total} {total === 1 ? "thing" : "things"} for
                you
              </div>
            </div>
            <ChevronDown className="size-4 text-foreground-secondary transition-transform [[data-state=open]_&]:rotate-180" />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="flex flex-col gap-1.5 pt-0 pb-3 text-sm">
            {[...grouped.entries()].map(([type, count]) => (
              <Link
                key={type}
                to="/app/threads"
                search={{
                  signalType: type,
                  since: reportWindowStart.toISOString(),
                }}
                onClick={() =>
                  posthog?.capture("signal:report_link_clicked", {
                    signal_type: type,
                    count,
                    organization_id: organizationId,
                  })
                }
                className="flex items-center justify-between rounded px-2 py-1 text-foreground-secondary hover:bg-accent hover:text-foreground-primary"
              >
                <span>
                  · {SIGNAL_REPORT_VERB[type]} {count}{" "}
                  {count === 1 ? "thread" : "threads"}
                </span>
                <span className="text-foreground-secondary">→</span>
              </Link>
            ))}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

LeverageReport.Skeleton = function LeverageReportSkeleton() {
  return (
    <Card>
      <CardHeader size="sm">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-1.5 h-4 w-64" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-0 pb-3">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-44" />
        <Skeleton className="h-3 w-36" />
      </CardContent>
    </Card>
  );
};
