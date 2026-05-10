import type { PostHog } from "posthog-js";
import { LeverageReportMock } from "./leverage-report.mock";

type Props = {
  organizationId: string;
  organizationCreatedAt: Date | null;
  userId: string;
  userName: string;
  posthog: PostHog | null;
};

export function LeverageReport(_props: Props) {
  return <LeverageReportMock />;
}

/*
Original implementation (commented out while animating with mock data):

import { useLiveQuery } from "@live-state/sync/client";
import { Link } from "@tanstack/react-router";
import {
  type SignalType,
  signalTypeFromStored,
} from "@workspace/schemas/signals";
import { Avatar } from "@workspace/ui/components/avatar";
import { buttonVariants } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";
import { Maximize2, X } from "lucide-react";
import { motion } from "motion/react";
import type { PostHog } from "posthog-js";
import { useEffect, useMemo, useState } from "react";
import { query } from "~/lib/live-state";
import {
  markSnapshotSeenThisSession,
  markVisited,
  readSignalsVisit,
} from "~/lib/signals-visit";
import { buildThreadParam } from "~/utils/thread";

const TILE_TRANSITION = { duration: 0.275, ease: "easeInOut" } as const;

const NEW_ORG_DAY_THRESHOLD = 3;
const NEW_ORG_ACTION_THRESHOLD = 5;
const MAX_NAMED_TILES = 5;
const EXPANDED_LIST_LIMIT = 50;
// "Since your last visit" reads as broken when the gap is minutes wide
// (quick reload / tab flip). Below this, last-24h is the more useful framing.
const SINCE_VISIT_MIN_MS = 60 * 60 * 1000;
// Beyond this, since-visit aggregates get stale and tile counts balloon;
// fall back to last-24h for actionable recency.
const SINCE_VISIT_MAX_MS = 7 * 24 * 60 * 60 * 1000;

// Tile caption per signal type. Past-action noun phrase, plural-aware downstream
// is unnecessary because tiles always show >0 actions in aggregate.
const TILE_CAPTION: Record<SignalType, string> = {
  label: "Threads labeled",
  duplicate: "Duplicates linked",
  linked_pr: "PRs linked",
  pending_reply: "Reply nudges",
  loop_to_close: "Loops closed",
  suggested_reply: "Drafts ready",
  status: "Status updates",
  churn_risk: "Churn risks flagged",
  kb_gap: "KB gaps spotted",
  trending_issue: "Trends spotted",
};

type Action = {
  id: string;
  signalType: string;
  entityId: string;
  appliedAt: Date;
};

type Props = {
  organizationId: string;
  organizationCreatedAt: Date | null;
  userId: string;
  userName: string;
  posthog: PostHog | null;
};

export function LeverageReport({
  organizationId,
  organizationCreatedAt,
  userId,
  userName,
  posthog,
}: Props) {
  const allActions = useLiveQuery(
    query.autonomousAction.where({ organizationId, undoneAt: null }),
  );

  const visit = useMemo(
    () => readSignalsVisit(organizationId, userId),
    [organizationId, userId],
  );
  const [windowStart, mode] = useMemo(() => {
    const now = Date.now();
    const previous = visit.previousVisitAt?.getTime() ?? null;
    if (
      previous != null &&
      now - previous >= SINCE_VISIT_MIN_MS &&
      now - previous <= SINCE_VISIT_MAX_MS &&
      !visit.seenThisSession
    ) {
      return [new Date(previous), "since-visit" as const];
    }
    return [new Date(now - 24 * 60 * 60 * 1000), "last-24h" as const];
  }, [visit]);

  const orgDaysOld = useMemo(() => {
    if (!organizationCreatedAt) return null;
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

  useEffect(() => {
    const t = setTimeout(() => {
      if (isRenderable) markSnapshotSeenThisSession(organizationId, userId);
      markVisited(organizationId, userId);
    }, 2000);
    return () => clearTimeout(t);
  }, [isRenderable, organizationId, userId]);

  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (!allActions) return <LeverageReport.Skeleton />;
  if (isNewOrg) return null;

  const grouped = new Map<SignalType, number>();
  for (const a of inWindow) {
    const t = signalTypeFromStored(a.signalType);
    if (!t) continue;
    grouped.set(t, (grouped.get(t) ?? 0) + 1);
  }

  if (inWindow.length === 0) return null;

  const sorted = [...grouped.entries()].sort((a, b) => b[1] - a[1]);
  const named = sorted.slice(0, MAX_NAMED_TILES);
  const overflow = sorted.slice(MAX_NAMED_TILES);
  const otherCount = overflow.reduce((sum, [, c]) => sum + c, 0);
  const overflowTypes = new Set(overflow.map(([t]) => t));

  type Tile =
    | { kind: "named"; type: SignalType; count: number }
    | { kind: "other"; count: number };

  const tiles: Tile[] = named.map(([type, count]) => ({
    kind: "named" as const,
    type,
    count,
  }));
  if (otherCount > 0) tiles.push({ kind: "other", count: otherCount });

  const greeting = greetingFor(new Date());
  const firstName = userName.trim().split(/\s+/)[0] ?? userName;
  const windowPhrase =
    effectiveHeadingMode === "since-visit"
      ? "since your last visit"
      : "in the last 24 hours";

  const actionsForExpanded = (key: string): Action[] => {
    const matches = inWindow.filter((a) => {
      const t = signalTypeFromStored(a.signalType);
      if (key === "other") {
        return !t || overflowTypes.has(t);
      }
      return t === key;
    });
    return matches
      .map((a) => ({
        id: a.id,
        signalType: a.signalType,
        entityId: a.entityId,
        appliedAt: new Date(a.appliedAt),
      }))
      .sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime())
      .slice(0, EXPANDED_LIST_LIMIT);
  };

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
      <motion.div
        initial={false}
        animate={{ height: expandedKey ? 488 : 188 }}
        className="overflow-hidden"
      >
        <div className="relative h-[488px] w-full">
          <div
            className="grid h-[188px] gap-2 grid-cols-6 grid-rows-2"
            style={{ gridAutoRows: "minmax(90px, 1fr)" }}
          >
            {tiles.map((tile, i) => {
              const key = tile.kind === "named" ? tile.type : "other";
              const caption =
                tile.kind === "named"
                  ? TILE_CAPTION[tile.type]
                  : "Other actions";
              const isHero = tileSpan(tiles.length, i).includes("row-span-2");

              const onClick = () => {
                setExpandedKey(key);
                if (tile.kind === "named") {
                  posthog?.capture("signal:report_tile_expanded", {
                    signal_type: tile.type,
                    count: tile.count,
                    organization_id: organizationId,
                  });
                }
              };

              return (
                <div
                  key={key}
                  className={cn("min-w-0 relative", tileSpan(tiles.length, i))}
                >
                  <motion.button
                    type="button"
                    layoutId={`leverage-report-tile-${key}`}
                    className={cn(
                      "absolute inset-0 flex justify-between bg-background-tertiary p-3",
                      tileSpan(tiles.length, i),
                    )}
                    style={{
                      borderRadius: 8,
                      boxShadow: "inset 0 0 0 1px var(--border)",
                    }}
                    onClick={onClick}
                  >
                    <div className="flex flex-col justify-between h-full">
                      <motion.div
                        layoutId={`leverage-report-tile-count-${key}`}
                        className={cn(
                          "text-foreground-primary font-semibold leading-none text-left",
                          isHero ? "text-5xl" : "text-3xl",
                        )}
                      >
                        {tile.count}
                      </motion.div>
                      <motion.div
                        layoutId={`leverage-report-tile-caption-${key}`}
                        className={cn(
                          "text-foreground-secondary truncate text-sm text-left",
                        )}
                      >
                        {caption}
                      </motion.div>
                    </div>
                  </motion.button>
                  <motion.button
                    layoutId={`leverage-report-tile-tr-button-${key}`}
                    type="button"
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "icon-sm" }),
                      "absolute top-3 right-3",
                    )}
                    onClick={onClick}
                  >
                    <Maximize2 className="size-3.5" />
                  </motion.button>
                </div>
              );
            })}
          </div>

          {expandedKey
            ? (() => {
                const tile = tiles.find(
                  (t) =>
                    (t.kind === "named" ? t.type : "other") === expandedKey,
                );

                if (!tile) return null;

                const caption =
                  tile.kind === "named"
                    ? TILE_CAPTION[tile.type]
                    : "Other actions";

                return (
                  <ExpandedTile
                    tileKey={expandedKey}
                    caption={caption}
                    count={tile.count}
                    actions={actionsForExpanded(expandedKey)}
                    organizationId={organizationId}
                    reportWindowStart={reportWindowStart}
                    onClose={() => setExpandedKey(null)}
                    onViewAll={() => {
                      if (tile.kind === "named") {
                        posthog?.capture("signal:report_link_clicked", {
                          signal_type: tile.type,
                          count: tile.count,
                          organization_id: organizationId,
                        });
                      }
                    }}
                    navTarget={tile.kind === "named" ? tile.type : null}
                  />
                );
              })()
            : null}
        </div>
      </motion.div>
    </div>
  );
}

function ExpandedTile({
  tileKey,
  caption,
  count,
  actions,
  organizationId,
  onClose,
}: {
  tileKey: string;
  caption: string;
  count: number;
  actions: Action[];
  organizationId: string;
  reportWindowStart: Date;
  onClose: () => void;
  onViewAll: () => void;
  navTarget: SignalType | null;
}) {
  const threadIds = useMemo(
    () => Array.from(new Set(actions.map((a) => a.entityId))),
    [actions],
  );
  const threads = useLiveQuery(
    query.thread
      .where({
        id: { $in: threadIds },
        organizationId,
      })
      .include({ author: { include: { user: true } } }),
  );
  type ThreadInfo = {
    id: string;
    name: string;
    shortId: number | null;
    authorName: string | null;
    authorImage: string | null;
  };
  const threadById = useMemo(() => {
    const m = new Map<string, ThreadInfo>();
    for (const t of threads ?? []) {
      m.set(t.id, {
        id: t.id,
        name: t.name,
        shortId: t.shortId,
        authorName: t.author?.name ?? t.author?.user?.name ?? null,
        authorImage: t.author?.user?.image ?? null,
      });
    }
    return m;
  }, [threads]);

  return (
    <>
      <motion.div
        id={`leverage-report-tile-${tileKey}`}
        layoutId={`leverage-report-tile-${tileKey}`}
        style={{
          borderRadius: 8,
          boxShadow:
            "inset 0 0 0 1px var(--border), 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
        }}
        className="absolute inset-0 overflow-hidden bg-background-tertiary"
      >
        <div className="flex h-full w-full flex-col">
          <div className="flex items-center justify-between gap-3 p-3">
            <div className="flex min-w-0 items-baseline gap-2">
              <motion.div
                layoutId={`tile-count-${tileKey}`}
                style={{ fontSize: "1.125rem" }}
                className="text-foreground-primary font-semibold leading-none"
              >
                {count}
              </motion.div>
              <motion.div
                initial={{ opacity: 0, filter: "blur(4px)" }}
                animate={{
                  opacity: 1,
                  filter: "blur(0px)",
                  transition: { duration: 0.15, delay: 0.2 },
                }}
                className="truncate text-foreground-secondary text-sm"
              >
                {caption}
              </motion.div>
            </div>
            <div className="flex shrink-0 items-center gap-2"></div>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.15 }}
            className="flex-1 overflow-y-auto border-t border-border"
          >
            {actions.length === 0 ? (
              <div className="flex h-full items-center justify-center p-6 text-foreground-secondary text-sm">
                No actions to show.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {actions.map((action) => {
                  const thread = threadById.get(action.entityId);
                  const idParam = thread
                    ? buildThreadParam(thread)
                    : action.entityId;
                  return (
                    <li key={action.id}>
                      <Link
                        to="/app/threads/$id"
                        params={{ id: idParam }}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-accent"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar
                            variant="user"
                            size="md"
                            src={thread?.authorImage}
                            alt={thread?.authorName ?? undefined}
                            fallback={thread?.authorName ?? "?"}
                          />
                          <span className="truncate text-foreground-primary text-sm">
                            {thread?.name ?? "Untitled thread"}
                          </span>
                          {thread?.shortId != null ? (
                            <span className="shrink-0 text-foreground-secondary text-xs tabular-nums">
                              #{thread.shortId}
                            </span>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-foreground-secondary text-xs">
                          {formatRelativeTime(action.appliedAt)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {count > actions.length ? (
              <div className="px-4 py-2 text-foreground-secondary text-xs">
                Showing {actions.length} of {count}.
              </div>
            ) : null}
          </motion.div>
        </div>
      </motion.div>
      <motion.button
        layoutId={`leverage-report-tile-tr-button-${tileKey}`}
        type="button"
        onClick={onClose}
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "absolute top-3 right-3",
        )}
      >
        <X className="size-3.5" />
      </motion.button>
    </>
  );
}

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// 6-col x 2-row bento (12 cells). Tile sizes scale with rank (sorted by count).
function tileSpan(total: number, index: number): string {
  if (total === 1) return "col-span-6 row-span-2";
  if (total === 2) return "col-span-3 row-span-2";
  if (total === 3) {
    if (index === 0) return "col-span-3 row-span-2";
    return "col-span-3 row-span-1";
  }
  if (total === 4) {
    if (index < 2) return "col-span-2 row-span-2";
    return "col-span-2 row-span-1";
  }
  if (total === 5) {
    if (index === 0) return "col-span-2 row-span-2";
    return "col-span-2 row-span-1";
  }
  // total === 6
  return "col-span-2 row-span-1";
}

LeverageReport.Skeleton = function LeverageReportSkeleton() {
  return (
    <div className="flex w-full max-w-4xl mx-auto flex-col gap-3">
      <div className="px-1">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-1.5 h-3 w-72" />
      </div>
      <div className="grid grid-cols-6 grid-rows-2 gap-2 auto-rows-fr min-h-[180px]">
        <Skeleton className="col-span-2 row-span-2" />
        <Skeleton className="col-span-2 row-span-1" />
        <Skeleton className="col-span-2 row-span-1" />
        <Skeleton className="col-span-2 row-span-1" />
        <Skeleton className="col-span-2 row-span-1" />
      </div>
    </div>
  );
};
*/
