import { differenceInSeconds, formatDistanceToNowStrict } from "date-fns";

export function formatRelativeTime(
  date: Date,
  options?: { minimumDifference?: number },
) {
  const secondsAgo = differenceInSeconds(new Date(), date);

  if (secondsAgo < (options?.minimumDifference ?? 30)) {
    return "now";
  }

  return formatDistanceToNowStrict(date, { addSuffix: true });
}
