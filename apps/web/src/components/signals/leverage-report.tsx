import { useLiveQuery } from "@live-state/sync/client";
import { Link } from "@tanstack/react-router";
import { Skeleton as SkeletonUI } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
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
const MAX_NAMED_TILES = 5;
// "Since your last visit" reads as broken when the gap is minutes wide
// (quick reload / tab flip). Below this, last-24h is the more useful framing.
const SINCE_VISIT_MIN_MS = 60 * 60 * 1000;
// Beyond this, since-visit aggregates get stale and tile counts balloon;
// fall back to last-24h for actionable recency.
const SINCE_VISIT_MAX_MS = 7 * 24 * 60 * 60 * 1000;

// Tile caption per autonomous-action kind. Mirrors the discriminator on
// `autonomousActionMetadataSchema` (the receipt metadata kind), not the legacy
// SIGNAL_TYPES string.
type ReceiptKind = "apply_label" | "set_status" | "mark_duplicate" | "link_pr";
const TILE_CAPTION: Record<ReceiptKind, string> = {
  apply_label: "Threads labeled",
  link_pr: "PRs linked",
  mark_duplicate: "Duplicates linked",
  set_status: "Status updates",
};
const RECEIPT_KINDS: ReadonlySet<string> = new Set(Object.keys(TILE_CAPTION));

interface Props {
  organizationId: string;
  organizationCreatedAt: Date | null;
  userId: string;
  userName: string;
  posthog: PostHog | null;
}

export function LeverageReport({
  organizationId,
  organizationCreatedAt,
  userId,
  userName,
  posthog,
}: Props) {
  const allActions = useLiveQuery(
    query.autonomousAction.where({ organizationId, undoneAt: null })
  );

  const visit = useMemo(
    () => readSignalsVisit(organizationId, userId),
    [organizationId, userId]
  );
  const [windowStart, mode] = useMemo(() => {
    const now = Date.now();
    const previous = visit.previousVisitAt?.getTime() ?? null;
    if (
      previous !== null &&
      previous !== undefined &&
      now - previous >= SINCE_VISIT_MIN_MS &&
      now - previous <= SINCE_VISIT_MAX_MS &&
      !visit.seenThisSession
    ) {
      return [new Date(previous), "since-visit" as const];
    }
    return [new Date(now - 24 * 60 * 60 * 1000), "last-24h" as const];
  }, [visit]);

  const orgDaysOld = useMemo(() => {
    if (!organizationCreatedAt) {
      return null;
    }
    return (
      (Date.now() - organizationCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
  }, [organizationCreatedAt]);

  // "Since visit" uses previousVisitAt; if the user comes back soon, that
  // window can be seconds wide and show nothing even when recent history
  // exists. Fall back to last 24h in that case only.
  const { inWindow, reportWindowStart, effectiveHeadingMode } = useMemo(() => {
    const now = Date.now();
    const last24hStart = new Date(now - 24 * 60 * 60 * 1000);
    const filterFromStart = (start: Date) =>
      allActions
        ? allActions.filter(
            (a) => new Date(a.appliedAt).getTime() >= start.getTime()
          )
        : [];

    const primary = filterFromStart(windowStart);
    if (
      primary.length === 0 &&
      (allActions?.length ?? 0) > 0 &&
      mode === "since-visit"
    ) {
      return {
        effectiveHeadingMode: "last-24h" as const,
        inWindow: filterFromStart(last24hStart),
        reportWindowStart: last24hStart,
      };
    }
    return {
      effectiveHeadingMode: mode,
      inWindow: primary,
      reportWindowStart: windowStart,
    };
  }, [allActions, windowStart, mode]);

  const isNewOrg =
    (orgDaysOld === null ||
      orgDaysOld === undefined ||
      orgDaysOld < NEW_ORG_DAY_THRESHOLD) &&
    (allActions?.length ?? 0) < NEW_ORG_ACTION_THRESHOLD;

  const isRenderable = !!allActions && !isNewOrg && inWindow.length > 0;

  useEffect(() => {
    const t = setTimeout(() => {
      if (isRenderable) {
        markSnapshotSeenThisSession(organizationId, userId);
      }
      markVisited(organizationId, userId);
    }, 2000);
    return () => clearTimeout(t);
  }, [isRenderable, organizationId, userId]);

  if (!allActions) {
    return <LeverageReport.Skeleton />;
  }
  if (isNewOrg) {
    return null;
  }

  const grouped = new Map<ReceiptKind, number>();
  for (const a of inWindow) {
    if (!RECEIPT_KINDS.has(a.signalType)) {
      continue;
    }
    const k = a.signalType as ReceiptKind;
    grouped.set(k, (grouped.get(k) ?? 0) + 1);
  }

  if (inWindow.length === 0) {
    return null;
  }

  const sorted = [...grouped.entries()].toSorted((a, b) => b[1] - a[1]);
  const named = sorted.slice(0, MAX_NAMED_TILES);
  const overflow = sorted.slice(MAX_NAMED_TILES);
  const otherCount = overflow.reduce((sum, [, c]) => sum + c, 0);

  type Tile =
    | { kind: "named"; type: ReceiptKind; count: number }
    | { kind: "other"; count: number };

  const tiles: Tile[] = named.map(([type, count]) => ({
    count,
    kind: "named" as const,
    type,
  }));
  if (otherCount > 0) {
    tiles.push({ kind: "other", count: otherCount });
  }

  const greeting = greetingFor(new Date());
  const firstName = userName.trim().split(/\s+/)[0] ?? userName;
  const windowPhrase =
    effectiveHeadingMode === "since-visit"
      ? "since your last visit"
      : "in the last 24 hours";

  return (
    <div className="flex w-full max-w-4xl mx-auto flex-col gap-4">
      <div className="flex flex-col gap-1 px-1">
        <div className="text-foreground-primary text-base font-medium">
          {greeting}, {firstName}.
        </div>
        <div className="text-foreground-primary text-sm">
          Here's what FrontDesk handled {windowPhrase}.
        </div>
      </div>
      <div
        className={cn(
          "grid grid-cols-6 grid-rows-2 gap-2 auto-rows-fr",
          "min-h-[180px]"
        )}
      >
        {tiles.map((tile, i) => {
          const span = tileSpan(tiles.length, i);
          const isHero = span.includes("row-span-2");
          const key = tile.kind === "named" ? tile.type : "other";
          const caption =
            tile.kind === "named" ? TILE_CAPTION[tile.type] : "Other actions";
          const tileBody = (
            <div
              className={cn(
                "flex h-full w-full flex-col justify-between rounded-lg border border-border bg-card transition-colors hover:bg-accent",
                isHero ? "p-4" : "p-3"
              )}
            >
              <div
                className={cn(
                  "text-foreground-primary font-semibold leading-none",
                  isHero ? "text-5xl" : "text-3xl"
                )}
              >
                {tile.count}
              </div>
              <div
                className={cn(
                  "text-foreground-secondary",
                  isHero ? "text-base" : "text-xs"
                )}
              >
                {caption}
              </div>
            </div>
          );

          if (tile.kind === "other") {
            return (
              <div key={key} className={span}>
                {tileBody}
              </div>
            );
          }

          return (
            <Link
              key={key}
              to="/app/threads"
              search={{
                signalType: tile.type,
                since: reportWindowStart.toISOString(),
              }}
              onClick={() =>
                posthog?.capture("signal:report_link_clicked", {
                  count: tile.count,
                  organization_id: organizationId,
                  signal_type: tile.type,
                })
              }
              className={cn(span, "block")}
            >
              {tileBody}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 5) {
    return "Working late";
  }
  if (h < 12) {
    return "Good morning";
  }
  if (h < 18) {
    return "Good afternoon";
  }
  return "Good evening";
}

// 6-col x 2-row bento (12 cells). Tile sizes scale with rank (sorted by count).
function tileSpan(total: number, index: number): string {
  if (total === 1) {
    return "col-span-6 row-span-2";
  }
  if (total === 2) {
    return "col-span-3 row-span-2";
  }
  if (total === 3) {
    if (index === 0) {
      return "col-span-3 row-span-2";
    }
    return "col-span-3 row-span-1";
  }
  if (total === 4) {
    if (index < 2) {
      return "col-span-2 row-span-2";
    }
    return "col-span-2 row-span-1";
  }
  if (total === 5) {
    if (index === 0) {
      return "col-span-2 row-span-2";
    }
    return "col-span-2 row-span-1";
  }
  // total === 6
  return "col-span-2 row-span-1";
}

LeverageReport.Skeleton = function Skeleton() {
  return (
    <div className="flex w-full max-w-4xl mx-auto flex-col gap-3">
      <div className="px-1">
        <SkeletonUI className="h-4 w-48" />
        <SkeletonUI className="mt-1.5 h-3 w-72" />
      </div>
      <div className="grid grid-cols-6 grid-rows-2 gap-2 auto-rows-fr min-h-[180px]">
        <SkeletonUI className="col-span-2 row-span-2" />
        <SkeletonUI className="col-span-2 row-span-1" />
        <SkeletonUI className="col-span-2 row-span-1" />
        <SkeletonUI className="col-span-2 row-span-1" />
        <SkeletonUI className="col-span-2 row-span-1" />
      </div>
    </div>
  );
};
