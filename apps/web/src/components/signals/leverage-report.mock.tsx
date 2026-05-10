import { Avatar } from "@workspace/ui/components/avatar";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";
import { Maximize2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";

type MockSignalType =
  | "label"
  | "linked_pr"
  | "pending_reply"
  | "churn_risk"
  | "kb_gap"
  | "suggested_reply"
  | "loop_to_close";

type MockAction = {
  id: string;
  signalType: MockSignalType;
  appliedAt: Date;
  thread: {
    id: string;
    name: string;
    shortId: number;
    authorName: string;
    authorImage: string | null;
  };
};

const MAX_NAMED_TILES = 5;
const EXPANDED_LIST_LIMIT = 50;

const CAPTION_BLUR = "blur(6px)";
const CAPTION_MOTION_TRANSITION = {
  duration: 0.2,
  ease: [0.25, 0.1, 0.25, 1] as const,
};

const EXPANDED_CAPTION_MOTION = {
  initial: {
    opacity: 0,
    filter: CAPTION_BLUR,
  },
  animate: {
    opacity: 1,
    filter: "blur(0px)",
  },
  exit: {
    opacity: 0,
    filter: CAPTION_BLUR,
  },
  transition: CAPTION_MOTION_TRANSITION,
};

const COLLAPSED_CAPTION_MOTION = {
  initial: {
    opacity: 0,
    filter: CAPTION_BLUR,
  },
  animate: {
    opacity: 1,
    filter: "blur(0px)",
  },
  exit: {
    opacity: 0,
    filter: CAPTION_BLUR,
  },
  transition: {
    ...CAPTION_MOTION_TRANSITION,
    delay: 0.225,
  },
};

/** Stagger after shared layout expansion so the list fades in once the tile is already opening. */
const EXPANDED_ACTIONS_LIST_ENTER_DELAY_S = 0.12;

const EXPANDED_ACTIONS_LIST_MOTION = {
  initial: {
    opacity: 0,
    filter: CAPTION_BLUR,
  },
  animate: {
    opacity: 1,
    filter: "blur(0px)",
  },
  exit: {
    opacity: 0,
    filter: CAPTION_BLUR,
    transition: CAPTION_MOTION_TRANSITION,
  },
  transition: {
    ...CAPTION_MOTION_TRANSITION,
    delay: EXPANDED_ACTIONS_LIST_ENTER_DELAY_S,
  },
};

const TILE_CAPTION: Record<MockSignalType, string> = {
  label: "Threads labeled",
  linked_pr: "PRs linked",
  pending_reply: "Reply nudges",
  churn_risk: "Churn risks flagged",
  kb_gap: "KB gaps spotted",
  suggested_reply: "Drafts ready",
  loop_to_close: "Loops closed",
};

const MOCK_ACTIONS: MockAction[] = [
  {
    id: "a-001",
    signalType: "label",
    appliedAt: new Date(Date.now() - 5 * 60 * 1000),
    thread: {
      id: "t-101",
      name: "Checkout fails for cards in EU",
      shortId: 4201,
      authorName: "Ari Mason",
      authorImage: null,
    },
  },
  {
    id: "a-002",
    signalType: "linked_pr",
    appliedAt: new Date(Date.now() - 11 * 60 * 1000),
    thread: {
      id: "t-102",
      name: "Webhook retries flooding logs",
      shortId: 4217,
      authorName: "Noah Kim",
      authorImage: null,
    },
  },
  {
    id: "a-003",
    signalType: "label",
    appliedAt: new Date(Date.now() - 16 * 60 * 1000),
    thread: {
      id: "t-103",
      name: "Portal sidebar overlaps content on iPad",
      shortId: 4229,
      authorName: "Mia Brooks",
      authorImage: null,
    },
  },
  {
    id: "a-004",
    signalType: "pending_reply",
    appliedAt: new Date(Date.now() - 27 * 60 * 1000),
    thread: {
      id: "t-104",
      name: "Billing seat mismatch after downgrade",
      shortId: 4248,
      authorName: "Leo Watts",
      authorImage: null,
    },
  },
  {
    id: "a-005",
    signalType: "suggested_reply",
    appliedAt: new Date(Date.now() - 35 * 60 * 1000),
    thread: {
      id: "t-105",
      name: "Need recovery steps for deleted views",
      shortId: 4256,
      authorName: "Aya Singh",
      authorImage: null,
    },
  },
  {
    id: "a-006",
    signalType: "churn_risk",
    appliedAt: new Date(Date.now() - 49 * 60 * 1000),
    thread: {
      id: "t-106",
      name: "Enterprise account paused contract renewal",
      shortId: 4263,
      authorName: "Emma Ford",
      authorImage: null,
    },
  },
  {
    id: "a-007",
    signalType: "linked_pr",
    appliedAt: new Date(Date.now() - 63 * 60 * 1000),
    thread: {
      id: "t-107",
      name: "Autosave creates duplicate notes",
      shortId: 4272,
      authorName: "Theo Park",
      authorImage: null,
    },
  },
  {
    id: "a-008",
    signalType: "pending_reply",
    appliedAt: new Date(Date.now() - 80 * 60 * 1000),
    thread: {
      id: "t-108",
      name: "Export CSV missing timezone column",
      shortId: 4284,
      authorName: "Nina Diaz",
      authorImage: null,
    },
  },
  {
    id: "a-009",
    signalType: "loop_to_close",
    appliedAt: new Date(Date.now() - 96 * 60 * 1000),
    thread: {
      id: "t-109",
      name: "Incident response docs outdated",
      shortId: 4290,
      authorName: "Ivy Hart",
      authorImage: null,
    },
  },
  {
    id: "a-010",
    signalType: "kb_gap",
    appliedAt: new Date(Date.now() - 119 * 60 * 1000),
    thread: {
      id: "t-110",
      name: "Customer asks for SSO setup walkthrough",
      shortId: 4303,
      authorName: "Eli Shaw",
      authorImage: null,
    },
  },
  {
    id: "a-011",
    signalType: "linked_pr",
    appliedAt: new Date(Date.now() - 141 * 60 * 1000),
    thread: {
      id: "t-111",
      name: "Rate limiting blocks legitimate webhook bursts",
      shortId: 4314,
      authorName: "June Chen",
      authorImage: null,
    },
  },
  {
    id: "a-012",
    signalType: "label",
    appliedAt: new Date(Date.now() - 170 * 60 * 1000),
    thread: {
      id: "t-112",
      name: "Android push notifications delayed",
      shortId: 4321,
      authorName: "Owen Price",
      authorImage: null,
    },
  },
];

type Tile =
  | { kind: "named"; type: MockSignalType; count: number }
  | { kind: "other"; count: number };

export function LeverageReportMock() {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  /** While the overlay is exiting, suppress matching `layoutId`s on grid tiles so Motion never sees duplicates (wrong morph + blank inner list). */
  const [closingLayoutKey, setClosingLayoutKey] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<MockSignalType, number>();
    for (const action of MOCK_ACTIONS) {
      map.set(action.signalType, (map.get(action.signalType) ?? 0) + 1);
    }
    return map;
  }, []);

  const sorted = useMemo(
    () => [...grouped.entries()].sort((a, b) => b[1] - a[1]),
    [grouped],
  );
  const named = sorted.slice(0, MAX_NAMED_TILES);
  const overflow = sorted.slice(MAX_NAMED_TILES);
  const overflowTypes = new Set(overflow.map(([type]) => type));
  const otherCount = overflow.reduce((sum, [, count]) => sum + count, 0);

  const tiles: Tile[] = named.map(([type, count]) => ({
    kind: "named",
    type,
    count,
  }));
  if (otherCount > 0) {
    tiles.push({ kind: "other", count: otherCount });
  }

  const actionsForExpanded = (key: string): MockAction[] =>
    MOCK_ACTIONS.filter((action) => {
      if (key === "other") {
        return overflowTypes.has(action.signalType);
      }
      return action.signalType === key;
    })
      .sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime())
      .slice(0, EXPANDED_LIST_LIMIT);

  const expandedTile =
    expandedKey !== null
      ? tiles.find(
          (entry) =>
            (entry.kind === "named" ? entry.type : "other") === expandedKey,
        )
      : undefined;

  const expandedActions =
    expandedKey !== null && expandedTile ? actionsForExpanded(expandedKey) : [];

  const handleCloseExpanded = () => {
    if (expandedKey !== null) {
      setClosingLayoutKey(expandedKey);
    }
    setExpandedKey(null);
  };

  const expandedCaption =
    expandedTile === undefined
      ? ""
      : expandedTile.kind === "named"
        ? TILE_CAPTION[expandedTile.type]
        : "Other actions";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-col gap-1 px-1">
        <div className="text-base text-foreground-primary font-medium">
          Good afternoon, Pedro.
        </div>
        <div className="text-foreground-primary text-sm">
          Here is what FrontDesk handled in the last 24 hours.
        </div>
      </div>

      <div
        className="relative"
        style={{
          height: expandedKey ? 384 : 188,
        }}
      >
        <div
          className="grid h-[188px] grid-cols-6 grid-rows-2 gap-2"
          style={{ gridAutoRows: "minmax(90px, 1fr)" }}
        >
          {tiles.map((tile) => {
            const key = tile.kind === "named" ? tile.type : "other";
            const caption =
              tile.kind === "named" ? TILE_CAPTION[tile.type] : "Other actions";
            const gridOwnsSharedLayout =
              expandedKey !== key && closingLayoutKey !== key;

            return (
              <motion.button
                key={key}
                type="button"
                className={cn(
                  `col-span-2 flex min-h-[90px] min-w-0 justify-between bg-background-tertiary p-3 text-left relative`,
                )}
                style={{
                  borderRadius: 8,
                  boxShadow: "inset 0 0 0 1px var(--border)",
                }}
                onClick={() => setExpandedKey(key)}
                layoutId={gridOwnsSharedLayout ? `tile-${key}` : undefined}
              >
                <div className="flex flex-col justify-between">
                  <motion.span
                    className="text-foreground-primary leading-none font-semibold text-4"
                    layoutId={
                      gridOwnsSharedLayout ? `tile-count-${key}` : undefined
                    }
                    layout="position"
                    style={{
                      fontSize: "2.25rem",
                    }}
                  >
                    {tile.count}
                  </motion.span>
                  <AnimatePresence initial={false}>
                    {expandedKey !== key ? (
                      <motion.div
                        key={`tile-caption-${key}`}
                        className="truncate text-left text-foreground-secondary text-sm"
                        {...COLLAPSED_CAPTION_MOTION}
                      >
                        {caption}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
                <motion.div
                  className={`flex items-center justify-center hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50`}
                  layoutId={
                    gridOwnsSharedLayout ? `tile-tr-action-${key}` : undefined
                  }
                  style={{
                    width: 24,
                    height: 24,
                  }}
                >
                  <Maximize2 className="size-3.5" />
                </motion.div>
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence
          onExitComplete={() => setClosingLayoutKey(null)}
        >
          {expandedKey !== null && expandedTile && (
            <motion.div
              key={expandedKey}
              className="absolute flex inset-x-0 top-0 h-96 flex-col overflow-hidden bg-background-tertiary"
              style={{
                borderRadius: 8,
                boxShadow: "inset 0 0 0 1px var(--border)",
              }}
              layoutId={`tile-${expandedKey}`}
              exit={{
                opacity: 1,
                transition: {
                  when: "afterChildren",
                },
              }}
            >
              <div className="flex shrink-0 gap-2 p-3 justify-between">
                <div className="flex gap-2 items-center">
                  <motion.span
                    className="text-foreground-primary leading-none font-semibold"
                    layoutId={`tile-count-${expandedKey}`}
                    style={{
                      fontSize: "1.5rem",
                    }}
                    layout="position"
                  >
                    {expandedTile.count}
                  </motion.span>
                  <motion.div
                    key={`expanded-caption-${expandedKey}`}
                    className="truncate text-foreground-secondary text-sm"
                    {...EXPANDED_CAPTION_MOTION}
                  >
                    {expandedCaption}
                  </motion.div>
                </div>

                <motion.button
                  type="button"
                  onClick={handleCloseExpanded}
                  className="flex items-center justify-center hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 8,
                  }}
                  aria-label="Close expanded tile"
                  layoutId={`tile-tr-action-${expandedKey}`}
                  // style={{
                  //   position: "absolute",
                  // }}
                >
                  <X className="size-3.5" />
                </motion.button>
              </div>

              <AnimatePresence mode="wait" initial={false} propagate>
                <motion.div
                  key={`expanded-actions-body-${expandedKey}`}
                  className="flex min-h-0 flex-1 flex-col border-border border-t"
                  {...EXPANDED_ACTIONS_LIST_MOTION}
                >
                  {expandedActions.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center p-6 text-foreground-secondary text-sm">
                      No actions to show.
                    </div>
                  ) : (
                    <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
                      {expandedActions.map((action) => (
                        <li key={action.id}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <Avatar
                                variant="user"
                                size="md"
                                src={action.thread.authorImage}
                                alt={action.thread.authorName}
                                fallback={action.thread.authorName}
                              />
                              <span className="truncate text-foreground-primary text-sm">
                                {action.thread.name}
                              </span>
                              <span className="shrink-0 text-foreground-secondary text-xs tabular-nums">
                                #{action.thread.shortId}
                              </span>
                            </span>
                            <span className="shrink-0 text-foreground-secondary text-xs">
                              {formatRelativeTime(action.appliedAt)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {expandedTile.count > expandedActions.length ? (
                    <div className="shrink-0 border-border border-t px-4 py-2 text-foreground-secondary text-xs">
                      Showing {expandedActions.length} of {expandedTile.count}.
                    </div>
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
