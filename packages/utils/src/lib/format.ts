import { differenceInSeconds, formatDistanceToNowStrict } from "date-fns";

const HAS_EXPLICIT_OFFSET = /[zZ]|[+-]\d{2}:?\d{2}$/;

/**
 * Postgres `to_json(timestamp)` (used by live-state nested includes) emits
 * timezone-less ISO strings. `new Date` treats those as local, so a UTC wall
 * clock is shifted by the browser offset — GMT-3 reads as "in 3 hours".
 */
export function parseLiveTimestamp(value: Date | string | number): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "number") {
    return new Date(value);
  }

  const trimmed = value.trim();
  if (HAS_EXPLICIT_OFFSET.test(trimmed)) {
    return new Date(trimmed);
  }

  const iso = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  return new Date(`${iso}Z`);
}

export function formatRelativeTime(
  date: Date | string,
  options?: { minimumDifference?: number }
) {
  const parsed = parseLiveTimestamp(date);
  const secondsAgo = differenceInSeconds(new Date(), parsed);

  if (Math.abs(secondsAgo) < (options?.minimumDifference ?? 30)) {
    return "now";
  }

  return formatDistanceToNowStrict(parsed, { addSuffix: true });
}
