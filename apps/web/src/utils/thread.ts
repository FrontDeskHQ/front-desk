import { addDays, differenceInDays } from "date-fns";

export const DAYS_UNTIL_DELETION = 30;

export function calculateDeletionDate(): Date {
  return addDays(new Date(), DAYS_UNTIL_DELETION);
}

export function getDaysUntilDeletion(deletedAt: Date | null): number | null {
  if (!deletedAt) return null;
  return Math.ceil(differenceInDays(deletedAt, new Date()));
}
