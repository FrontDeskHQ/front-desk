import { defineIndex, uuidFromParts } from "./define-index";
import type { SearchHit } from "./define-index";

/**
 * v2 gave thread points a deterministic identity. v1 derived its point id from
 * `crypto.randomUUID()` on every pipeline run, so a re-embedded thread
 * accumulated a new point instead of overwriting its old one and similarity
 * search ranked stale copies of the same thread against each other. Rolling the
 * collection leaves those orphaned points behind rather than reaping them.
 *
 * A thread re-enters the index on its next pipeline run — the collection name is
 * part of `embed`'s idempotency hash, so the roll invalidates every thread's
 * key. That does **not** cover dormant threads, which receive no pipeline run at
 * all and so are never repopulated. Until the index-only backfill (FRO-221) has
 * run, do not drop `threads-v1`: it is the cheapest source to copy from.
 */
export const THREADS_COLLECTION = "threads-v2";

export interface ThreadPayload {
  threadId: string;
  organizationId: string;
  title: string;
  shortDescription: string;
  keywords: string[];
  entities: string[];
  expectedAction: string;
  status: number;
  priority: number;
  authorId: string;
  assignedUserId: string | null;
  labels: string[];
  createdAt: number;
  updatedAt: number;
}

export type ThreadHit = SearchHit<ThreadPayload>;

export const threadIndex = defineIndex<
  ThreadPayload,
  "organizationId" | "threadId"
>({
  dimensions: 3072,
  key: ({ organizationId, threadId }) =>
    uuidFromParts(organizationId, threadId),
  name: THREADS_COLLECTION,
  payloadIndexes: [
    { field: "organizationId", schema: "keyword" },
    { field: "status", schema: "integer" },
    { field: "priority", schema: "integer" },
    { field: "keywords", schema: "keyword" },
    { field: "labels", schema: "keyword" },
    { field: "createdAt", schema: "integer" },
    { field: "threadId", schema: "keyword" },
  ],
});
