import type { ActionKind } from "@workspace/schemas/signals";

export interface MockThreadReference {
  author?: { name: string; user?: { image?: string | null } };
  assignedUser?: { name: string } | null;
  assignedUserId?: string | null;
  createdAt?: Date;
  id: string;
  name: string;
  priority?: number;
  shortId: number;
  status?: number;
}

export interface MockSignalCardData {
  alternativeKinds?: ActionKind[];
  authorName: string;
  /**
   * Pre-rendered relative label ("4m"), not a `Date`. Formatting a real date
   * against `new Date()` renders differently on the server than at hydration;
   * the mock only ever needs the frozen copy anyway.
   */
  createdAtLabel: string;
  id: string;
  primaryKinds: ActionKind[];
  recommendation: string;
  shortId: number;
  summary: string;
  title: string;
  urgencyScore: number;
}
