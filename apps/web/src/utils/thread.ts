import { addDays, differenceInDays } from "date-fns";

export const DAYS_UNTIL_DELETION = 30;

export function calculateDeletionDate(): Date {
  return addDays(new Date(), DAYS_UNTIL_DELETION);
}

export function getDaysUntilDeletion(deletedAt: Date | null): number | null {
  if (!deletedAt) return null;
  return Math.ceil(differenceInDays(deletedAt, new Date()));
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export type ParsedThreadParam =
  | { kind: "ulid"; id: string }
  | { kind: "shortId"; shortId: number };

export function parseThreadParam(raw: string): ParsedThreadParam | null {
  if (ULID_RE.test(raw)) return { kind: "ulid", id: raw.toLowerCase() };
  const m = raw.match(/^(\d+)(?:-.*)?$/);
  if (m) return { kind: "shortId", shortId: Number(m[1]) };
  return null;
}

export function slugifyThreadName(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/[\s-]+/)
    .filter(Boolean);
  let out = "";
  for (let i = 0; i < Math.min(words.length, 8); i++) {
    const next = out ? `${out}-${words[i]}` : words[i];
    if (next.length > 64) break;
    out = next;
  }
  return out;
}

export function buildThreadParam(thread: {
  id: string;
  shortId: number | null;
  name: string;
}): string {
  if (thread.shortId == null) return thread.id;
  const slug = slugifyThreadName(thread.name);
  return slug ? `${thread.shortId}-${slug}` : String(thread.shortId);
}
