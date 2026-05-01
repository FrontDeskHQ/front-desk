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
import { useEffect, useMemo, useState } from "react";
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

  // Snapshot the visit state once at mount. The window doesn't shift mid-view.
  const [visit] = useState(() => readSignalsVisit(userId));
  const [windowStart, mode] = useMemo(() => {
    const now = Date.now();
    const previous = visit.previousVisitAt?.getTime() ?? null;
    if (previous && !visit.seenThisSession) {
      return [new Date(previous), "since-visit" as const];
    }
    return [new Date(now - 24 * 60 * 60 * 1000), "last-24h" as const];
  }, [visit]);

  // After the snapshot has been on screen briefly, mark the session as having
  // seen it (so a same-tab refresh switches to "last 24h"), and bump the
  // persisted lastVisit so the next session's snapshot starts from now.
  useEffect(() => {
    const t = setTimeout(() => {
      markSnapshotSeenThisSession(userId);
      markVisited(userId);
    }, 2000);
    return () => clearTimeout(t);
  }, [userId]);

  const orgDaysOld = useMemo(() => {
    if (!organizationCreatedAt) return null;
    return (Date.now() - organizationCreatedAt.getTime()) / (1000 * 60 * 60 * 24);
  }, [organizationCreatedAt]);

  if (!allActions) return <LeverageReport.Skeleton />;

  // Hide on truly new orgs.
  if (
    (orgDaysOld == null || orgDaysOld < NEW_ORG_DAY_THRESHOLD) &&
    allActions.length < NEW_ORG_ACTION_THRESHOLD
  ) {
    return null;
  }

  const inWindow = allActions.filter(
    (a) => new Date(a.appliedAt).getTime() >= windowStart.getTime(),
  );

  const grouped = new Map<SignalType, number>();
  for (const a of inWindow) {
    const t = signalTypeFromStored(a.signalType);
    if (!t) continue;
    grouped.set(t, (grouped.get(t) ?? 0) + 1);
  }

  const total = inWindow.length;
  const heading =
    mode === "since-visit" && visit.previousVisitAt
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
                  since: windowStart.toISOString(),
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
