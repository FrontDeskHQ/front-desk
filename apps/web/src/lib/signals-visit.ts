// Per-device, per-user UI state for the Signals page leverage report.
//
// Two layers:
//   - localStorage: when the user *last* visited Signals (persists across sessions).
//   - sessionStorage: whether they've already seen the "since last visit"
//     snapshot in *this* tab session (so a refresh switches to "last 24h").

const VISIT_KEY_PREFIX = "frontdesk:signals-visit:";
const SESSION_KEY_PREFIX = "frontdesk:signals-snapshot-seen:";

function visitKey(userId: string): string {
  return `${VISIT_KEY_PREFIX}${userId}`;
}

function sessionKey(userId: string): string {
  return `${SESSION_KEY_PREFIX}${userId}`;
}

export type SignalsVisit = {
  // The timestamp of the *previous* visit, captured at mount.
  // null on the user's first ever visit on this device.
  previousVisitAt: Date | null;
  // Whether this tab session has already marked the snapshot as seen.
  seenThisSession: boolean;
};

export function readSignalsVisit(userId: string): SignalsVisit {
  if (typeof window === "undefined") {
    return { previousVisitAt: null, seenThisSession: false };
  }
  let previousVisitAt: Date | null = null;
  try {
    const raw = window.localStorage.getItem(visitKey(userId));
    if (raw) previousVisitAt = new Date(raw);
  } catch {
    /* ignore */
  }
  let seenThisSession = false;
  try {
    seenThisSession =
      window.sessionStorage.getItem(sessionKey(userId)) === "1";
  } catch {
    /* ignore */
  }
  return { previousVisitAt, seenThisSession };
}

export function markVisited(userId: string, at: Date = new Date()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(visitKey(userId), at.toISOString());
  } catch {
    /* ignore */
  }
}

export function markSnapshotSeenThisSession(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(sessionKey(userId), "1");
  } catch {
    /* ignore */
  }
}
