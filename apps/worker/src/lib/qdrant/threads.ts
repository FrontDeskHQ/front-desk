import { defineIndex, uuidFromParts } from "./define-index";
import type { SearchHit } from "./define-index";

/**
 * v2: FRO-2xx gave thread points a deterministic identity. v1 derived its point
 * id from `crypto.randomUUID()` on every pipeline run, so a re-embedded thread
 * accumulated a new point instead of overwriting its old one and similarity
 * search ranked stale copies of the same thread against each other. Rolling the
 * collection leaves those orphaned points behind rather than reaping them; v1
 * can be dropped manually once no worker references it.
 *
 * Threads re-enter the index on their next natural pipeline run, so duplicate
 * detection and the `related_prs` / `related_issues` hints are cold for a thread
 * until it runs again.
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
