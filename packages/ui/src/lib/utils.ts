import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export { formatRelativeTime } from "@workspace/utils/format";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
