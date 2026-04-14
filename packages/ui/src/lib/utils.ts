import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export { formatRelativeTime } from "@workspace/utils/format";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
