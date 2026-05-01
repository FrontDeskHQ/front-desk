// Per-device, per-(org, user) UI state for the Signals page leverage report.
//
// Two layers:
//   - localStorage: when the user *last* visited Signals (persists across sessions).
//   - sessionStorage: whether they've already seen the "since last visit"
//     snapshot in *this* tab session (so a refresh switches to "last 24h").
//
// Keys are scoped by both organizationId and userId so switching workspaces
// doesn't bleed one org's snapshot boundary into another.

const VISIT_KEY_PREFIX = "frontdesk:signals-visit:";
const SESSION_KEY_PREFIX = "frontdesk:signals-snapshot-seen:";

function visitKey(organizationId: string, userId: string): string {
  return `${VISIT_KEY_PREFIX}${organizationId}:${userId}`;
}

function sessionKey(organizationId: string, userId: string): string {
  return `${SESSION_KEY_PREFIX}${organizationId}:${userId}`;
}

export type SignalsVisit = {
  // The timestamp of the *previous* visit, captured at mount.
  // null on the user's first ever visit on this device.
  previousVisitAt: Date | null;
  // Whether this tab session has already marked the snapshot as seen.
  seenThisSession: boolean;
};

export function readSignalsVisit(
  organizationId: string,
  userId: string,
): SignalsVisit {
  if (typeof window === "undefined") {
    return { previousVisitAt: null, seenThisSession: false };
  }
  let previousVisitAt: Date | null = null;
  try {
    const raw = window.localStorage.getItem(visitKey(organizationId, userId));
    if (raw) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) previousVisitAt = parsed;
    }
  } catch {
    /* ignore */
  }
  let seenThisSession = false;
  try {
    seenThisSession =
      window.sessionStorage.getItem(sessionKey(organizationId, userId)) === "1";
  } catch {
    /* ignore */
  }
  return { previousVisitAt, seenThisSession };
}

export function markVisited(
  organizationId: string,
  userId: string,
  at: Date = new Date(),
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      visitKey(organizationId, userId),
      at.toISOString(),
    );
  } catch {
    /* ignore */
  }
}

export function markSnapshotSeenThisSession(
  organizationId: string,
  userId: string,
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(sessionKey(organizationId, userId), "1");
  } catch {
    /* ignore */
  }
}
