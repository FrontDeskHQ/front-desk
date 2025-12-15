import { type ClassValue, clsx } from "clsx";
import { differenceInSeconds, formatDistanceToNowStrict } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(
  date: Date,
  options?: { minimumDifference?: number }
) {
  const secondsAgo = differenceInSeconds(new Date(), date);

  if (secondsAgo < (options?.minimumDifference ?? 30)) {
    return "now";
  }

  return formatDistanceToNowStrict(date, { addSuffix: true });
}
