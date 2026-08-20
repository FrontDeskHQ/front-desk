import {
  configureThreadReadQueue,
  createQueueRedisConnection,
  enqueueThreadRead as enqueueDurableThreadRead,
} from "@workspace/queue/thread-read";
import type {
  EnqueueThreadReadOptions,
  ThreadReadEnqueueResult,
  ThreadReadJobPriority,
} from "@workspace/queue/thread-read";
import type {
  IssueIndexJobData,
  PrIndexJobData,
  PrMatchCandidate,
  ThreadReadKind,
} from "@workspace/schemas/signals";
import { Queue } from "bullmq";
import type Redis from "ioredis";

import "../env";
import { areWorkerJobsEnabled } from "./feature-flag";

const CRAWL_DOCUMENTATION_QUEUE = "crawl-documentation";
const PR_INDEX_QUEUE = "pr-index";
const PR_INDEX_JOB_NAME = "index-pr";
const ISSUE_INDEX_QUEUE = "issue-index";
const ISSUE_INDEX_JOB_NAME = "index-issue";

export type {
  EnqueueThreadReadOptions,
  ThreadReadEnqueueResult,
  ThreadReadJobPriority,
};

let connection: Redis | null = null;
let threadReadQueueConfigured = false;
const createApiRedisConnection = (): Redis | null =>
  createQueueRedisConnection({ allowLocalhostFallback: false });

export const enqueueThreadRead = async (
  threadId: string,
  opts: {
    kind: ThreadReadKind;
    /** Used to evaluate `support-intelligence-pipeline`. Optional so a live-state visibility race can still enqueue. */
    organizationId?: string;
    /** Candidate PR for a `pr_matched` trigger (ADR 0006 trigger channel). */
    prMatched?: PrMatchCandidate;
  } & EnqueueThreadReadOptions
): Promise<ThreadReadEnqueueResult> => {
  // A missing tenant cannot evaluate the flag at enqueue time. Still enqueue
  // so a live-state visibility race does not drop the trigger; the worker
  // re-checks `areWorkerJobsEnabled` after it hydrates the thread.
  if (
    opts.organizationId !== undefined &&
    !areWorkerJobsEnabled(opts.organizationId)
  ) {
    return {
      disposition: "skipped",
      jobId: null,
      reason: "worker_disabled",
    };
  }

  if (!threadReadQueueConfigured) {
    connection ??= createApiRedisConnection();
    if (!connection) {
      return {
        disposition: "skipped",
        jobId: null,
        reason: "queue_unavailable",
      };
    }
    configureThreadReadQueue({ connection });
    threadReadQueueConfigured = true;
  }

  // TODO(issue-09): manual kind should bypass dedup (unique jobId + delay 0)
  // and invalidate synthesis-track idempotency keys before enqueueing. For now
  // it falls through to the normal-dedup path so the surface compiles.
  return enqueueDurableThreadRead(
    threadId,
    {
      kind: opts.kind,
      ...(opts.prMatched ? { prMatched: opts.prMatched } : {}),
    },
    { delayMs: opts.delayMs, priority: opts.priority }
  );
};

// Crawl Documentation Queue

export interface CrawlDocumentationJobData {
  documentationSourceId: string;
  organizationId: string;
  baseUrl: string;
}

let crawlDocQueue: Queue<CrawlDocumentationJobData> | null = null;

const getCrawlDocQueue = (): Queue<CrawlDocumentationJobData> | null => {
  if (crawlDocQueue) {
    return crawlDocQueue;
  }

  connection ??= createApiRedisConnection();
  if (!connection) {
    return null;
  }

  crawlDocQueue = new Queue<CrawlDocumentationJobData>(
    CRAWL_DOCUMENTATION_QUEUE,
    {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 5000, type: "exponential" },
      },
    }
  );
  return crawlDocQueue;
};

export const enqueueCrawlDocumentation = async (
  data: CrawlDocumentationJobData
): Promise<string | null> => {
  if (!areWorkerJobsEnabled(data.organizationId)) {
    return null;
  }

  const crawlQueue = getCrawlDocQueue();
  if (!crawlQueue) {
    return null;
  }

  const job = await crawlQueue.add("crawl-documentation", data, {
    jobId: `crawl-${data.documentationSourceId}`,
  });

  return job.id ?? null;
};

// PR embedding index queue (FRO-203)
//
// The worker owns the PR vector index (embedding + Qdrant live only there); the
// API is the single mirror choke point (`externalEntity.upsert`), so it enqueues
// an index job after every PR mirror write. Index-only: this never fans out
// `pr_matched` thread reads. One pending job per PR (`pr-index:{externalKey}`)
// coalesces a burst of mirror events into a single re-embed.

let prIndexQueue: Queue<PrIndexJobData> | null = null;

const getPrIndexQueue = (): Queue<PrIndexJobData> | null => {
  if (prIndexQueue) {
    return prIndexQueue;
  }

  connection ??= createApiRedisConnection();
  if (!connection) {
    return null;
  }

  prIndexQueue = new Queue<PrIndexJobData>(PR_INDEX_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { delay: 5000, type: "exponential" },
    },
  });
  return prIndexQueue;
};

export const enqueuePrIndex = async (
  data: PrIndexJobData
): Promise<string | null> => {
  if (!areWorkerJobsEnabled(data.organizationId)) {
    return null;
  }

  const q = getPrIndexQueue();
  if (!q) {
    return null;
  }

  // Latest mirror state wins: any prior re-index for the same PR is replaced by
  // this newer one (BullMQ ignores `add` for an existing jobId — across *all*
  // states, including completed/failed — so drop the stale job first). We remove
  // in every state except `active`, where the processor is mid-run and removal is
  // unsafe; that window is narrow and the worker's content-hash dedup mitigates
  // it. Cheap because the worker skips re-embedding on unchanged content anyway.
  const jobId = `pr-index:${data.externalKey}`;
  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state !== "active") {
      await existing.remove();
    }
  }

  const job = await q.add(PR_INDEX_JOB_NAME, data, {
    jobId,
    removeOnComplete: { age: 24 * 3600, count: 100 },
    removeOnFail: { count: 500 },
  });

  return job.id ?? null;
};

// Issue embedding index queue (FRO-217)
//
// The issue-index counterpart to `pr-index`, with the same ownership split: the
// worker owns the vector index, the API is the single mirror choke point
// (`externalEntity.upsert`) and enqueues after every issue mirror write. One
// pending job per issue (`issue-index:{externalKey}`) coalesces a burst of
// mirror events into a single re-embed.

let issueIndexQueue: Queue<IssueIndexJobData> | null = null;

const getIssueIndexQueue = (): Queue<IssueIndexJobData> | null => {
  if (issueIndexQueue) {
    return issueIndexQueue;
  }

  connection ??= createApiRedisConnection();
  if (!connection) {
    return null;
  }

  issueIndexQueue = new Queue<IssueIndexJobData>(ISSUE_INDEX_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { delay: 5000, type: "exponential" },
    },
  });
  return issueIndexQueue;
};

export const enqueueIssueIndex = async (
  data: IssueIndexJobData
): Promise<string | null> => {
  if (!areWorkerJobsEnabled(data.organizationId)) {
    return null;
  }

  const q = getIssueIndexQueue();
  if (!q) {
    return null;
  }

  // Latest mirror state wins — same reasoning as `enqueuePrIndex`: BullMQ
  // ignores `add` for an existing jobId across all states, so drop the stale
  // job first, in every state except `active` where removal is unsafe.
  //
  // The id is scoped by organization because `externalKey` is not: two orgs
  // mirroring the same upstream repo would otherwise coalesce onto one job and
  // one of them would silently miss its vector update — the vector points are
  // keyed `(organizationId, externalKey)`, so they are genuinely distinct work.
  // The key is percent-encoded rather than colon-stripped: BullMQ rejects a
  // custom job id unless it is colon-free or exactly three colon-separated
  // segments, and a lossy substitution could map two distinct keys onto one id,
  // letting one issue's enqueue delete another's pending job.
  const jobId = `issue-index:${data.organizationId}:${encodeURIComponent(data.externalKey)}`;
  const existing = await q.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state !== "active") {
      await existing.remove();
    }
  }

  const job = await q.add(ISSUE_INDEX_JOB_NAME, data, {
    jobId,
    removeOnComplete: { age: 24 * 3600, count: 100 },
    removeOnFail: { count: 500 },
  });

  return job.id ?? null;
};

// GitHub backfill queue
//
// The github app owns this job: it runs the processor (apps/github/src/jobs/
// backfill.ts) and defines the canonical queue/job constants and enqueue helper
// (apps/github/src/lib/queue.ts). The API only *enqueues* onto the same Redis
// queue — for the dev-only manual sync that stands in for webhooks locally, and
// for the catch-up backfill on silent re-enable. Keep the queue name, job name
// and jobId scheme in sync with the owner.
const GITHUB_BACKFILL_QUEUE = "github-backfill";
const GITHUB_BACKFILL_JOB_NAME = "backfill-repo";

export interface GithubBackfillJobData {
  organizationId: string;
  installationId: number;
  owner: string;
  repo: string;
  fullName: string;
}

let githubBackfillQueue: Queue<GithubBackfillJobData> | null = null;

const getGithubBackfillQueue = (): Queue<GithubBackfillJobData> | null => {
  if (githubBackfillQueue) {
    return githubBackfillQueue;
  }

  connection ??= createApiRedisConnection();
  if (!connection) {
    return null;
  }

  githubBackfillQueue = new Queue<GithubBackfillJobData>(
    GITHUB_BACKFILL_QUEUE,
    {
      connection,
    }
  );
  return githubBackfillQueue;
};

/**
 * Enqueue a full issue/PR backfill for a single repo onto the github app's
 * queue. The jobId is derived from `(organizationId, fullName)` so re-running
 * coalesces onto one pending job per repo — the processor is idempotent
 * (upsert-by-externalKey), so re-running only refreshes existing rows.
 */
export const enqueueGithubBackfill = async (
  data: GithubBackfillJobData
): Promise<string | null> => {
  const backfillQueue = getGithubBackfillQueue();
  if (!backfillQueue) {
    return null;
  }

  // Escape existing underscores before swapping the `/` separator so the jobId
  // stays injective (e.g. `a_b/c` and `a/b_c` map to distinct ids).
  const safeFullName = data.fullName.replaceAll("_", "__").replace("/", "_");
  const jobId = `backfill_${data.organizationId}_${safeFullName}`;
  const job = await backfillQueue.add(GITHUB_BACKFILL_JOB_NAME, data, {
    attempts: 3,
    backoff: { delay: 10_000, type: "exponential" },
    jobId,
    removeOnComplete: { age: 24 * 3600, count: 50 },
    removeOnFail: { count: 200 },
  });

  return job.id ?? null;
};
