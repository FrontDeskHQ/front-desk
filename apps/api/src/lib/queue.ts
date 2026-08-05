import { randomUUID } from "node:crypto";

import type {
  CanonicalThreadReadJobData,
  PrIndexJobData,
  PrMatchCandidate,
  ThreadReadJobData,
  ThreadReadTrigger,
  ThreadReadKind,
} from "@workspace/schemas/signals";
import {
  mergeThreadReadTriggers,
  normalizeThreadReadJobData,
  threadReadTriggerSchema,
} from "@workspace/schemas/signals";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { z } from "zod";

import "../env";

// TEMP: Worker service stopped on Railway — re-enable in prod when worker is
// back. Always enabled in development so the pipeline can run locally.
const WORKER_JOBS_DISABLED = process.env.NODE_ENV === "production";

/** False when worker enqueue is intentionally skipped (e.g. prod without worker service). */
export const areWorkerJobsEnabled = (): boolean => !WORKER_JOBS_DISABLED;

const THREAD_PIPELINE_QUEUE = "thread-pipeline";
const THREAD_READ_JOB_NAME = "thread-read";
const THREAD_READ_JOB_ID_PREFIX = "thread:";
const THREAD_READ_PENDING_KEY_PREFIX = "frontdesk:thread-read-pending:";
const THREAD_READ_ENQUEUE_LOCK_TTL_MS = 30_000;
const THREAD_READ_ENQUEUE_LOCK_RETRY_MS = 25;
const THREAD_READ_ENQUEUE_LOCK_RENEW_INTERVAL_MS = Math.floor(
  THREAD_READ_ENQUEUE_LOCK_TTL_MS / 3
);
const THREAD_READ_RECOVERY_CONCURRENCY = 8;
const CRAWL_DOCUMENTATION_QUEUE = "crawl-documentation";
const PR_INDEX_QUEUE = "pr-index";
const PR_INDEX_JOB_NAME = "index-pr";

const DEFAULT_DEBOUNCE_MS = (() => {
  const raw = process.env.THREAD_READ_DEBOUNCE_MS;
  if (!raw) {
    return 2000;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 2000;
})();

export type ThreadReadJobPriority = "high" | "normal" | "low";

export type ThreadReadEnqueueDisposition =
  | "scheduled"
  | "coalesced"
  | "buffered"
  | "skipped";

export interface ThreadReadEnqueueResult {
  disposition: ThreadReadEnqueueDisposition;
  generation?: number;
  jobId: string | null;
  reason?:
    | "active_job"
    | "duplicate_trigger"
    | "queue_unavailable"
    | "stale_job_requeued"
    | "terminal_job_requeued"
    | "worker_disabled";
}

const THREAD_READ_PRIORITY_VALUES: Record<ThreadReadJobPriority, number> = {
  high: 1,
  low: 100,
  normal: 10,
};

const PENDING_THREAD_READ_STATES = new Set([
  "delayed",
  "paused",
  "prioritized",
  "waiting",
  "waiting-children",
]);

const TERMINAL_THREAD_READ_STATES = new Set(["completed", "failed"]);

const pendingThreadReadStateSchema = z.object({
  generation: z.number().int().nonnegative(),
  priority: z.enum(["high", "normal", "low"]),
  triggers: z.array(threadReadTriggerSchema).min(1),
  claimedGeneration: z.number().int().nonnegative().optional(),
  claimedAt: z.number().int().positive().optional(),
});

type PendingThreadReadState = z.infer<typeof pendingThreadReadStateSchema>;

export interface EnqueueThreadReadOptions {
  priority?: ThreadReadJobPriority;
  delayMs?: number;
}

let connection: Redis | null = null;
let queue: Queue<CanonicalThreadReadJobData> | null = null;

const RELEASE_THREAD_READ_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  end
  return 0
`;

const RENEW_THREAD_READ_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
  end
  return 0
`;

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const withThreadReadEnqueueLock = async <T>(
  threadId: string,
  operation: () => Promise<T>
): Promise<T> => {
  const redis = connection;
  if (!redis) {
    return operation();
  }

  const lockKey = `frontdesk:thread-read-enqueue:${threadId}`;
  const lockToken = randomUUID();
  const deadline = Date.now() + THREAD_READ_ENQUEUE_LOCK_TTL_MS;

  while (
    !(await redis.set(
      lockKey,
      lockToken,
      "PX",
      THREAD_READ_ENQUEUE_LOCK_TTL_MS,
      "NX"
    ))
  ) {
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out acquiring thread-read enqueue lock: ${threadId}`
      );
    }
    await sleep(THREAD_READ_ENQUEUE_LOCK_RETRY_MS);
  }

  const renewLock = async (): Promise<void> => {
    try {
      await redis.eval(
        RENEW_THREAD_READ_LOCK_SCRIPT,
        1,
        lockKey,
        lockToken,
        String(THREAD_READ_ENQUEUE_LOCK_TTL_MS)
      );
    } catch {
      // The lock still has its original TTL; the operation will release it or
      // let it expire if Redis is unavailable during renewal.
    }
  };
  const renewalTimer = setInterval(() => {
    void renewLock();
  }, THREAD_READ_ENQUEUE_LOCK_RENEW_INTERVAL_MS);

  try {
    return await operation();
  } finally {
    clearInterval(renewalTimer);
    try {
      await redis.eval(RELEASE_THREAD_READ_LOCK_SCRIPT, 1, lockKey, lockToken);
    } catch {
      // Lock key expires via TTL; avoid masking successful enqueue results.
    }
  }
};

const createRedisConnection = (): Redis | null => {
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  }

  if (!process.env.REDIS_HOST) {
    return null;
  }

  const redisConfig: {
    host: string;
    port?: number;
    password?: string;
    db?: number;
    maxRetriesPerRequest: null;
  } = {
    host: process.env.REDIS_HOST,
    maxRetriesPerRequest: null,
  };

  if (process.env.REDIS_PORT) {
    redisConfig.port = Number.parseInt(process.env.REDIS_PORT, 10);
  }

  if (process.env.REDIS_PASSWORD) {
    redisConfig.password = process.env.REDIS_PASSWORD;
  }

  if (process.env.REDIS_DB) {
    redisConfig.db = Number.parseInt(process.env.REDIS_DB, 10);
  }

  return new Redis(redisConfig);
};

const getThreadPipelineQueue = (): Queue<CanonicalThreadReadJobData> | null => {
  if (queue) {
    return queue;
  }

  connection ??= createRedisConnection();
  if (!connection) {
    return null;
  }

  queue = new Queue<CanonicalThreadReadJobData>(THREAD_PIPELINE_QUEUE, {
    connection,
  });
  return queue;
};

const buildThreadReadJobId = (threadId: string): string =>
  `${THREAD_READ_JOB_ID_PREFIX}${threadId}:read`;

const buildPendingThreadReadKey = (threadId: string): string =>
  `${THREAD_READ_PENDING_KEY_PREFIX}${threadId}`;

const buildThreadReadTriggers = (opts: {
  kind: ThreadReadKind;
  prMatched?: PrMatchCandidate;
}): ThreadReadTrigger[] => [
  {
    kind: opts.kind,
    ...(opts.prMatched ? { prMatched: opts.prMatched } : {}),
  },
];

const sameJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const higherPriority = (
  left: ThreadReadJobPriority,
  right: ThreadReadJobPriority
): ThreadReadJobPriority =>
  THREAD_READ_PRIORITY_VALUES[left] <= THREAD_READ_PRIORITY_VALUES[right]
    ? left
    : right;

const readPendingThreadRead = async (
  redis: Redis,
  threadId: string
): Promise<PendingThreadReadState | null> => {
  const raw = await redis.get(buildPendingThreadReadKey(threadId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = pendingThreadReadStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.error(
        `[thread-read] Ignoring malformed pending state for ${threadId}`
      );
      return null;
    }
    return parsed.data;
  } catch (error) {
    console.error(
      `[thread-read] Ignoring unreadable pending state for ${threadId}:`,
      error
    );
    return null;
  }
};

const writePendingThreadRead = async (
  redis: Redis,
  threadId: string,
  state: PendingThreadReadState
): Promise<void> => {
  await redis.set(buildPendingThreadReadKey(threadId), JSON.stringify(state));
};

const clearPendingThreadRead = async (
  redis: Redis,
  threadId: string,
  generation: number
): Promise<void> => {
  const current = await readPendingThreadRead(redis, threadId);
  if (current?.generation === generation) {
    await redis.del(buildPendingThreadReadKey(threadId));
  }
};

const isPendingThreadReadClaimed = (state: PendingThreadReadState): boolean =>
  state.claimedGeneration === state.generation;

/**
 * Claim a generation before touching BullMQ. If the acknowledgement write is
 * lost after enqueue, a later terminal callback can recognize that the job was
 * already scheduled instead of replaying the same generation.
 */
const claimPendingThreadRead = async (
  redis: Redis,
  threadId: string,
  expected: PendingThreadReadState
): Promise<PendingThreadReadState | null> => {
  const current = await readPendingThreadRead(redis, threadId);
  if (!current) {
    return null;
  }
  if (current.generation !== expected.generation) {
    return current;
  }
  if (isPendingThreadReadClaimed(current)) {
    return current;
  }

  const claimed: PendingThreadReadState = {
    ...current,
    claimedAt: Date.now(),
    claimedGeneration: current.generation,
  };
  await writePendingThreadRead(redis, threadId, claimed);
  return claimed;
};

const releasePendingThreadReadClaim = async (
  redis: Redis,
  threadId: string,
  generation: number
): Promise<void> => {
  const current = await readPendingThreadRead(redis, threadId);
  if (
    current?.generation === generation &&
    isPendingThreadReadClaimed(current)
  ) {
    await writePendingThreadRead(redis, threadId, {
      ...current,
      claimedAt: undefined,
      claimedGeneration: undefined,
    });
  }
};

/** Acknowledgement is best effort; a claimed generation prevents replay. */
const acknowledgePendingThreadRead = async (
  redis: Redis,
  threadId: string,
  generation: number
): Promise<void> => {
  try {
    await clearPendingThreadRead(redis, threadId, generation);
  } catch (error) {
    console.error(
      `[thread-read] Failed to acknowledge pending generation ${generation} for ${threadId}:`,
      error
    );
  }
};

const changePriorityIfNeeded = async (
  job: {
    changePriority: (opts: { priority: number }) => Promise<void>;
    opts: { priority?: number };
  },
  priority: ThreadReadJobPriority
): Promise<void> => {
  const target = THREAD_READ_PRIORITY_VALUES[priority];
  const current = job.opts.priority ?? 0;
  if (current > target) {
    await job.changePriority({ priority: target });
  }
};

const hasPendingThreadReadBeenApplied = (
  job: {
    data: ThreadReadJobData;
    opts: { priority?: number };
  },
  pending: PendingThreadReadState
): boolean => {
  try {
    const existingData = normalizeThreadReadJobData(job.data);
    const merged = mergeThreadReadTriggers(
      existingData.triggers,
      pending.triggers
    );
    const pendingPriority = THREAD_READ_PRIORITY_VALUES[pending.priority];
    const existingPriority = job.opts.priority ?? 0;
    return (
      sameJson(existingData.triggers, merged) &&
      existingPriority <= pendingPriority
    );
  } catch {
    return false;
  }
};

const mergePendingThreadRead = async (
  redis: Redis,
  threadId: string,
  triggers: readonly ThreadReadTrigger[],
  priority: ThreadReadJobPriority
): Promise<{ changed: boolean; state: PendingThreadReadState }> => {
  const existing = await readPendingThreadRead(redis, threadId);
  const mergedTriggers = mergeThreadReadTriggers(
    existing?.triggers ?? [],
    triggers
  );
  const mergedPriority = higherPriority(
    existing?.priority ?? priority,
    priority
  );

  if (
    existing &&
    sameJson(existing.triggers, mergedTriggers) &&
    existing.priority === mergedPriority
  ) {
    return { changed: false, state: existing };
  }

  const next: PendingThreadReadState = {
    generation: (existing?.generation ?? 0) + 1,
    priority: mergedPriority,
    triggers: mergedTriggers,
  };
  await writePendingThreadRead(redis, threadId, next);
  return { changed: true, state: next };
};

const buildCanonicalThreadReadJobData = (
  threadId: string,
  triggers: readonly ThreadReadTrigger[]
): CanonicalThreadReadJobData => ({
  threadId,
  triggers: [...triggers],
});

const skippedThreadReadResult = (
  reason: "queue_unavailable" | "worker_disabled"
): ThreadReadEnqueueResult => ({
  disposition: "skipped",
  jobId: null,
  reason,
});

export const enqueueThreadRead = async (
  threadId: string,
  opts: {
    kind: ThreadReadKind;
    /** Candidate PR for a `pr_matched` trigger (ADR 0006 trigger channel). */
    prMatched?: PrMatchCandidate;
  } & EnqueueThreadReadOptions
): Promise<ThreadReadEnqueueResult> => {
  if (WORKER_JOBS_DISABLED) {
    return skippedThreadReadResult("worker_disabled");
  }

  const q = getThreadPipelineQueue();
  if (!q) {
    return skippedThreadReadResult("queue_unavailable");
  }

  const delay = opts.delayMs ?? DEFAULT_DEBOUNCE_MS;
  const requestedPriority = opts.priority ?? "normal";
  const triggers = buildThreadReadTriggers(opts);
  const redis = connection;
  if (!redis) {
    return skippedThreadReadResult("queue_unavailable");
  }

  const jobId = buildThreadReadJobId(threadId);

  return withThreadReadEnqueueLock(threadId, async () => {
    let pending = await readPendingThreadRead(redis, threadId);
    const existing = await q.getJob(jobId);
    let requeueReason:
      | "stale_job_requeued"
      | "terminal_job_requeued"
      | undefined;

    if (existing) {
      const state = await existing.getState();

      if (state === "active") {
        const activeData = normalizeThreadReadJobData(
          existing.data as ThreadReadJobData
        );
        const mergedWithActive = mergeThreadReadTriggers(
          activeData.triggers,
          triggers
        );

        if (sameJson(activeData.triggers, mergedWithActive)) {
          return {
            disposition: "coalesced",
            jobId,
            reason: "duplicate_trigger",
          };
        }

        const buffered = await mergePendingThreadRead(
          redis,
          threadId,
          triggers,
          requestedPriority
        );
        return {
          disposition: buffered.changed ? "buffered" : "coalesced",
          generation: buffered.state.generation,
          jobId,
          ...(buffered.changed
            ? { reason: "active_job" as const }
            : { reason: "duplicate_trigger" as const }),
        };
      }

      if (PENDING_THREAD_READ_STATES.has(state)) {
        const existingData = normalizeThreadReadJobData(
          existing.data as ThreadReadJobData
        );
        let pendingForMerge = pending;
        if (pending) {
          pendingForMerge = await claimPendingThreadRead(
            redis,
            threadId,
            pending
          );
        }
        const merged = mergeThreadReadTriggers(
          existingData.triggers,
          pendingForMerge?.triggers ?? [],
          triggers
        );
        const mergedPriority = pendingForMerge
          ? higherPriority(pendingForMerge.priority, requestedPriority)
          : requestedPriority;

        try {
          if (!sameJson(existingData.triggers, merged)) {
            await existing.updateData(
              buildCanonicalThreadReadJobData(threadId, merged)
            );
          }
          await changePriorityIfNeeded(existing, mergedPriority);
        } catch (error) {
          if (pendingForMerge) {
            await releasePendingThreadReadClaim(
              redis,
              threadId,
              pendingForMerge.generation
            );
          }
          throw error;
        }
        if (pendingForMerge) {
          await acknowledgePendingThreadRead(
            redis,
            threadId,
            pendingForMerge.generation
          );
        }
        return {
          disposition: "coalesced",
          generation: pendingForMerge?.generation,
          jobId,
        };
      }

      // BullMQ keeps completed and failed jobs under their job ID. Remove
      // those terminal records before reusing the stable per-thread ID,
      // otherwise a later trigger can be reported as enqueued while BullMQ
      // silently returns the old completed job instead of scheduling a new
      // read.
      if (TERMINAL_THREAD_READ_STATES.has(state)) {
        requeueReason = "terminal_job_requeued";
      } else {
        // A job record with an unrecognized state is stale/orphaned. Leaving
        // it in Redis would make BullMQ silently ignore the next add with the
        // stable job ID and falsely report a scheduled read.
        requeueReason = "stale_job_requeued";
      }
      await existing.remove();
    }

    if (pending) {
      pending = await claimPendingThreadRead(redis, threadId, pending);
    }
    const merged = mergeThreadReadTriggers(pending?.triggers ?? [], triggers);
    const priority = pending
      ? higherPriority(pending.priority, requestedPriority)
      : requestedPriority;
    let job;
    try {
      job = await q.add(
        THREAD_READ_JOB_NAME,
        buildCanonicalThreadReadJobData(threadId, merged),
        {
          delay,
          jobId,
          priority: THREAD_READ_PRIORITY_VALUES[priority],
        }
      );
    } catch (error) {
      if (pending) {
        await releasePendingThreadReadClaim(
          redis,
          threadId,
          pending.generation
        );
      }
      throw error;
    }

    if (pending) {
      await acknowledgePendingThreadRead(redis, threadId, pending.generation);
    }

    return {
      disposition: "scheduled",
      generation: pending?.generation,
      jobId: job.id ?? jobId,
      ...(requeueReason ? { reason: requeueReason } : {}),
    };
  });
};

/** Drain one active-job follow-up after BullMQ has reached a terminal state. */
export const drainPendingThreadRead = async (
  threadId: string
): Promise<ThreadReadEnqueueResult | null> => {
  const q = getThreadPipelineQueue();
  const redis = connection;
  if (!q || !redis) {
    return skippedThreadReadResult("queue_unavailable");
  }

  const jobId = buildThreadReadJobId(threadId);

  return withThreadReadEnqueueLock(threadId, async () => {
    let pending = await readPendingThreadRead(redis, threadId);
    if (!pending) {
      return null;
    }

    let existing = await q.getJob(jobId);
    let existingState: string | undefined;
    if (isPendingThreadReadClaimed(pending)) {
      if (existing) {
        existingState = await existing.getState();
        if (existingState !== "unknown") {
          if (hasPendingThreadReadBeenApplied(existing, pending)) {
            await acknowledgePendingThreadRead(
              redis,
              threadId,
              pending.generation
            );
            return {
              disposition: "coalesced",
              generation: pending.generation,
              jobId,
            };
          }

          if (existingState === "active") {
            await releasePendingThreadReadClaim(
              redis,
              threadId,
              pending.generation
            );
            return {
              disposition: "buffered",
              generation: pending.generation,
              jobId,
              reason: "active_job",
            };
          }
        } else {
          await existing.remove();
        }
      }

      if (!existing || existingState === "unknown") {
        // A claim without a corresponding job means the process may have
        // crashed between recording the claim and enqueueing BullMQ. Release
        // it and retry the enqueue instead of treating the generation as
        // delivered.
        await releasePendingThreadReadClaim(
          redis,
          threadId,
          pending.generation
        );
        pending = await readPendingThreadRead(redis, threadId);
        existing = await q.getJob(jobId);
        if (!pending) {
          return null;
        }
      }
    }

    if (existing) {
      const state = await existing.getState();
      if (state === "active") {
        return {
          disposition: "buffered",
          generation: pending.generation,
          jobId,
          reason: "active_job",
        };
      }

      if (PENDING_THREAD_READ_STATES.has(state)) {
        const existingData = normalizeThreadReadJobData(
          existing.data as ThreadReadJobData
        );
        const pendingForMerge = await claimPendingThreadRead(
          redis,
          threadId,
          pending
        );
        if (!pendingForMerge) {
          return null;
        }
        const merged = mergeThreadReadTriggers(
          existingData.triggers,
          pendingForMerge.triggers
        );
        try {
          if (!sameJson(existingData.triggers, merged)) {
            await existing.updateData(
              buildCanonicalThreadReadJobData(threadId, merged)
            );
          }
          await changePriorityIfNeeded(existing, pendingForMerge.priority);
        } catch (error) {
          await releasePendingThreadReadClaim(
            redis,
            threadId,
            pendingForMerge.generation
          );
          throw error;
        }
        await acknowledgePendingThreadRead(
          redis,
          threadId,
          pendingForMerge.generation
        );
        return {
          disposition: "coalesced",
          generation: pendingForMerge.generation,
          jobId,
        };
      }

      if (
        TERMINAL_THREAD_READ_STATES.has(state) ||
        !PENDING_THREAD_READ_STATES.has(state)
      ) {
        await existing.remove();
      }
    }

    const pendingForEnqueue = await claimPendingThreadRead(
      redis,
      threadId,
      pending
    );
    if (!pendingForEnqueue) {
      return null;
    }

    let job;
    try {
      job = await q.add(
        THREAD_READ_JOB_NAME,
        buildCanonicalThreadReadJobData(threadId, pendingForEnqueue.triggers),
        {
          delay: 0,
          jobId,
          priority: THREAD_READ_PRIORITY_VALUES[pendingForEnqueue.priority],
        }
      );
    } catch (error) {
      await releasePendingThreadReadClaim(
        redis,
        threadId,
        pendingForEnqueue.generation
      );
      throw error;
    }
    await acknowledgePendingThreadRead(
      redis,
      threadId,
      pendingForEnqueue.generation
    );

    return {
      disposition: "scheduled",
      generation: pendingForEnqueue.generation,
      jobId: job.id ?? jobId,
    };
  });
};

/** Recover pending causes left behind if an API/worker process restarted. */
export const recoverPendingThreadReads = async (): Promise<number> => {
  const q = getThreadPipelineQueue();
  const redis = connection;
  if (!q || !redis) {
    return 0;
  }

  let cursor = "0";
  let scheduled = 0;
  do {
    let nextCursor: string;
    let keys: string[];
    try {
      [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        `${THREAD_READ_PENDING_KEY_PREFIX}*`,
        "COUNT",
        "100"
      );
    } catch (error) {
      console.error("[thread-read] Pending recovery scan failed:", error);
      break;
    }
    cursor = nextCursor;

    for (
      let index = 0;
      index < keys.length;
      index += THREAD_READ_RECOVERY_CONCURRENCY
    ) {
      const batch = keys.slice(index, index + THREAD_READ_RECOVERY_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (key) => {
          const threadId = key.slice(THREAD_READ_PENDING_KEY_PREFIX.length);
          try {
            return await drainPendingThreadRead(threadId);
          } catch (error) {
            console.error(
              `[thread-read] Pending recovery failed for ${threadId}:`,
              error
            );
            return null;
          }
        })
      );
      scheduled += results.filter(
        (result) => result?.disposition === "scheduled"
      ).length;
    }
  } while (cursor !== "0");

  return scheduled;
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

  connection ??= createRedisConnection();
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
  if (WORKER_JOBS_DISABLED) {
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

  connection ??= createRedisConnection();
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
  if (WORKER_JOBS_DISABLED) {
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

  connection ??= createRedisConnection();
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
