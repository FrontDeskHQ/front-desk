import { randomUUID } from "node:crypto";

import {
  mergeThreadReadTriggers,
  normalizeThreadReadJobData,
  sortThreadReadTriggers,
  threadReadTriggerSchema,
} from "@workspace/schemas/signals";
import type {
  ThreadReadJobData,
  ThreadReadTrigger,
} from "@workspace/schemas/signals";
import { Queue } from "bullmq";
import type { Job, JobState } from "bullmq";
import Redis from "ioredis";
import { z } from "zod";

export const THREAD_PIPELINE_QUEUE = "thread-pipeline";
export const THREAD_READ_JOB_NAME = "thread-read";

const LOCK_TTL_MS = 30_000;
const QUEUE_COMMAND_TIMEOUT_MS = 15_000;
const LOCK_RETRY_MS = 25;
const PENDING_PREFIX = "frontdesk:thread-read-pending:";
const CLAIMED_PREFIX = "frontdesk:thread-read-claimed:";
const GENERATION_PREFIX = "frontdesk:thread-read-generation:";
const LOCK_PREFIX = "frontdesk:thread-read-enqueue:";

const RELEASE_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  end
  return 0
`;

const RENEW_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
  end
  return 0
`;

const CLAIM_PENDING_SCRIPT = `
  if redis.call("get", KEYS[3]) ~= ARGV[1] then
    return "__LOCK_LOST__"
  end
  local claimed = redis.call("get", KEYS[2])
  if claimed then
    return claimed
  end
  local pending = redis.call("get", KEYS[1])
  if not pending then
    return false
  end
  redis.call("set", KEYS[2], pending)
  redis.call("del", KEYS[1])
  return pending
`;

const ACK_CLAIM_SCRIPT = `
  if redis.call("get", KEYS[2]) ~= ARGV[1] then
    return -1
  end
  if redis.call("get", KEYS[1]) == ARGV[2] then
    return redis.call("del", KEYS[1])
  end
  return 0
`;

const WRITE_PENDING_SCRIPT = `
  if redis.call("get", KEYS[1]) ~= ARGV[1] then
    return -1
  end
  local current = redis.call("get", KEYS[2])
  if ARGV[2] == "" then
    if current then
      return -2
    end
  elseif current ~= ARGV[2] then
    return -2
  end
  redis.call("set", KEYS[2], ARGV[3])
  return 1
`;

const RELEASE_CLAIM_SCRIPT = `
  if redis.call("get", KEYS[1]) ~= ARGV[1] then
    return -1
  end
  local currentPending = redis.call("get", KEYS[2])
  if ARGV[2] == "" then
    if currentPending then
      return -2
    end
  elseif currentPending ~= ARGV[2] then
    return -2
  end
  if redis.call("get", KEYS[3]) ~= ARGV[3] then
    return -3
  end
  redis.call("set", KEYS[2], ARGV[4])
  redis.call("del", KEYS[3])
  return 1
`;

const DEFAULT_DEBOUNCE_MS = 2000;
const THREAD_READ_DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { delay: 5000, type: "exponential" as const },
};

export type ThreadReadJobPriority = "high" | "normal" | "low";

export const THREAD_READ_PRIORITY_VALUES: Record<
  ThreadReadJobPriority,
  number
> = {
  high: 1,
  low: 100,
  normal: 10,
};

export type ThreadReadEnqueueDisposition =
  | "scheduled"
  | "coalesced"
  | "buffered"
  | "skipped";

export type ThreadReadEnqueueReason =
  | "active_job"
  | "duplicate_trigger"
  | "no_pending_triggers"
  | "queue_unavailable"
  | "stale_requeue"
  | "terminal_requeue"
  | "worker_disabled";

export interface ThreadReadEnqueueResult {
  disposition: ThreadReadEnqueueDisposition;
  jobId: string | null;
  reason?: ThreadReadEnqueueReason;
}

export interface EnqueueThreadReadOptions {
  delayMs?: number;
  priority?: ThreadReadJobPriority;
}

interface PendingThreadRead {
  generation: number;
  priority: number;
  triggers: ThreadReadTrigger[];
}

interface ThreadReadLockLease {
  key: string;
  token: string;
}

const pendingThreadReadSchema = z.object({
  generation: z.number().int().positive(),
  priority: z.number().int().nonnegative(),
  triggers: z.array(threadReadTriggerSchema).min(1),
});

type ThreadReadJob = Pick<
  Job<ThreadReadJobData>,
  | "changePriority"
  | "data"
  | "getState"
  | "id"
  | "opts"
  | "remove"
  | "updateData"
>;

export interface ThreadReadQueueAdapter {
  add(
    name: string,
    data: ThreadReadJobData,
    options: { delay: number; jobId: string; priority: number }
  ): Promise<ThreadReadJob>;
  getJob(jobId: string): Promise<ThreadReadJob | undefined>;
}

export interface ThreadReadRedisAdapter {
  del(...keys: string[]): Promise<number>;
  eval(
    script: string,
    numberOfKeys: number,
    ...args: (string | number)[]
  ): Promise<unknown>;
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  scan(
    cursor: string,
    matchToken: "MATCH",
    pattern: string,
    countToken: "COUNT",
    count: number
  ): Promise<[cursor: string, keys: string[]]>;
  set(
    key: string,
    value: string,
    ...args: (string | number)[]
  ): Promise<unknown>;
}

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const parsePending = (raw: string): PendingThreadRead => {
  const parsed = pendingThreadReadSchema.parse(JSON.parse(raw));
  return {
    generation: parsed.generation,
    priority: parsed.priority,
    triggers: mergeThreadReadTriggers(parsed.triggers),
  };
};

const serializePending = (pending: PendingThreadRead): string =>
  JSON.stringify({
    generation: pending.generation,
    priority: pending.priority,
    triggers: pending.triggers,
  });

const pendingKey = (threadId: string): string => `${PENDING_PREFIX}${threadId}`;
const claimedKey = (threadId: string): string => `${CLAIMED_PREFIX}${threadId}`;
const generationKey = (threadId: string): string =>
  `${GENERATION_PREFIX}${threadId}`;
const lockKey = (threadId: string): string => `${LOCK_PREFIX}${threadId}`;
const jobIdForThread = (threadId: string): string => `thread:${threadId}:read`;

const triggerFingerprint = (triggers: readonly ThreadReadTrigger[]): string =>
  JSON.stringify(sortThreadReadTriggers(triggers));

const containsTriggers = (
  haystack: readonly ThreadReadTrigger[],
  needles: readonly ThreadReadTrigger[]
): boolean =>
  triggerFingerprint(mergeThreadReadTriggers(haystack, needles)) ===
  triggerFingerprint(haystack);

const isMutableState = (state: JobState | "unknown"): boolean =>
  state === "delayed" || state === "waiting" || state === "prioritized";

const isTerminalState = (state: JobState | "unknown"): boolean =>
  state === "completed" || state === "failed";

export class ThreadReadQueueManager {
  private readonly defaultDebounceMs: number;
  private readonly queue: ThreadReadQueueAdapter;
  private readonly redis: ThreadReadRedisAdapter;

  constructor(
    queue: ThreadReadQueueAdapter,
    redis: ThreadReadRedisAdapter,
    defaultDebounceMs = DEFAULT_DEBOUNCE_MS
  ) {
    this.queue = queue;
    this.redis = redis;
    this.defaultDebounceMs = defaultDebounceMs;
  }

  private async withLock<T>(
    threadId: string,
    operation: (lease: ThreadReadLockLease) => Promise<T>
  ): Promise<T> {
    const key = lockKey(threadId);
    const token = randomUUID();
    const deadline = Date.now() + LOCK_TTL_MS;

    while (!(await this.redis.set(key, token, "PX", LOCK_TTL_MS, "NX"))) {
      if (Date.now() >= deadline) {
        throw new Error(`Timed out acquiring thread-read lock: ${threadId}`);
      }
      await sleep(LOCK_RETRY_MS);
    }

    let stopped = false;
    let renewalTimer: ReturnType<typeof setTimeout> | undefined;
    const renew = async (): Promise<void> => {
      if (stopped) {
        return;
      }
      try {
        const renewed = await this.redis.eval(
          RENEW_LOCK_SCRIPT,
          1,
          key,
          token,
          LOCK_TTL_MS
        );
        if (Number(renewed) !== 1) {
          stopped = true;
        }
      } catch {
        // The original lease still expires safely. The operation may finish
        // before then, and its durable claim remains recoverable if it does not.
      } finally {
        if (!stopped) {
          renewalTimer = setTimeout(renew, LOCK_TTL_MS / 3);
        }
      }
    };
    renewalTimer = setTimeout(renew, LOCK_TTL_MS / 3);

    try {
      // Never abandon a BullMQ mutation while releasing its serialization
      // lock. The production adapter bounds every Redis-backed queue command,
      // and the lease stays renewed until that command settles so a stale
      // mutation cannot race a newer owner and overwrite newer triggers.
      return await operation({ key, token });
    } finally {
      stopped = true;
      if (renewalTimer) {
        clearTimeout(renewalTimer);
      }
      try {
        await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
      } catch {
        // The TTL remains the final safety net; never mask the queue outcome.
      }
    }
  }

  private async buffer(
    lease: ThreadReadLockLease,
    threadId: string,
    triggers: readonly ThreadReadTrigger[],
    priority: number
  ): Promise<PendingThreadRead> {
    const key = pendingKey(threadId);
    const currentRaw = await this.redis.get(key);
    const current = currentRaw ? parsePending(currentRaw) : null;
    const generation = await this.redis.incr(generationKey(threadId));
    const pending: PendingThreadRead = {
      generation,
      priority: Math.min(current?.priority ?? priority, priority),
      triggers: mergeThreadReadTriggers(current?.triggers ?? [], triggers),
    };
    const written = await this.redis.eval(
      WRITE_PENDING_SCRIPT,
      2,
      lease.key,
      key,
      lease.token,
      currentRaw ?? "",
      serializePending(pending)
    );
    if (Number(written) !== 1) {
      throw new Error(`Lost thread-read lock before buffering: ${threadId}`);
    }
    return pending;
  }

  private async claim(
    lease: ThreadReadLockLease,
    threadId: string
  ): Promise<{
    pending: PendingThreadRead;
    raw: string;
  } | null> {
    const raw = await this.redis.eval(
      CLAIM_PENDING_SCRIPT,
      3,
      pendingKey(threadId),
      claimedKey(threadId),
      lease.key,
      lease.token
    );
    if (raw === "__LOCK_LOST__") {
      throw new Error(`Lost thread-read lock before claiming: ${threadId}`);
    }
    if (typeof raw !== "string") {
      return null;
    }
    return { pending: parsePending(raw), raw };
  }

  private async acknowledge(
    lease: ThreadReadLockLease,
    threadId: string,
    raw: string
  ): Promise<boolean> {
    const acknowledged = await this.redis.eval(
      ACK_CLAIM_SCRIPT,
      2,
      claimedKey(threadId),
      lease.key,
      lease.token,
      raw
    );
    return Number(acknowledged) === 1;
  }

  private async releaseClaim(
    lease: ThreadReadLockLease,
    threadId: string,
    claim: { pending: PendingThreadRead; raw: string }
  ): Promise<void> {
    const key = pendingKey(threadId);
    const currentRaw = await this.redis.get(key);
    const current = currentRaw ? parsePending(currentRaw) : null;
    const restored: PendingThreadRead = {
      generation: Math.max(
        claim.pending.generation,
        current?.generation ?? claim.pending.generation
      ),
      priority: Math.min(
        claim.pending.priority,
        current?.priority ?? claim.pending.priority
      ),
      triggers: mergeThreadReadTriggers(
        claim.pending.triggers,
        current?.triggers ?? []
      ),
    };
    const released = await this.redis.eval(
      RELEASE_CLAIM_SCRIPT,
      3,
      lease.key,
      key,
      claimedKey(threadId),
      lease.token,
      currentRaw ?? "",
      claim.raw,
      serializePending(restored)
    );
    if (Number(released) !== 1) {
      throw new Error(`Lost thread-read lock before releasing: ${threadId}`);
    }
  }

  private async verifyApplied(
    threadId: string,
    pending: PendingThreadRead
  ): Promise<boolean> {
    const job = await this.queue.getJob(jobIdForThread(threadId));
    if (!job) {
      return false;
    }
    const data = normalizeThreadReadJobData(job.data);
    const priority = job.opts.priority ?? THREAD_READ_PRIORITY_VALUES.normal;
    return (
      data.threadId === threadId &&
      priority <= pending.priority &&
      containsTriggers(data.triggers, pending.triggers)
    );
  }

  private async drainUnderLock(
    lease: ThreadReadLockLease,
    threadId: string,
    delayMs: number
  ): Promise<ThreadReadEnqueueResult> {
    const claim = await this.claim(lease, threadId);
    if (!claim) {
      return {
        disposition: "skipped",
        jobId: null,
        reason: "no_pending_triggers",
      };
    }

    const jobId = jobIdForThread(threadId);
    let existing = await this.queue.getJob(jobId);
    let existingState: JobState | "unknown" | null = null;

    try {
      if (existing) {
        existingState = await existing.getState();
        if (existingState === "active") {
          await this.releaseClaim(lease, threadId, claim);
          return { disposition: "buffered", jobId, reason: "active_job" };
        }

        if (isMutableState(existingState)) {
          const existingData = normalizeThreadReadJobData(existing.data);
          const mergedTriggers = mergeThreadReadTriggers(
            existingData.triggers,
            claim.pending.triggers
          );
          const existingPriority =
            existing.opts.priority ?? THREAD_READ_PRIORITY_VALUES.normal;
          const mergedPriority = Math.min(
            existingPriority,
            claim.pending.priority
          );
          const changed =
            triggerFingerprint(existingData.triggers) !==
              triggerFingerprint(mergedTriggers) ||
            mergedPriority !== existingPriority;

          if (changed) {
            await existing.updateData({ threadId, triggers: mergedTriggers });
            if (mergedPriority !== existingPriority) {
              await existing.changePriority({ priority: mergedPriority });
            }
          }

          // A worker can claim a waiting job between the state read above and
          // updateData. Once active, its processor may already hold the old
          // payload even if Redis now shows the merged data. Keep the claim
          // pending unless the job is still mutable after the mutation.
          const current = await this.queue.getJob(jobId);
          const currentState = current ? await current.getState() : "unknown";
          if (!isMutableState(currentState)) {
            await this.releaseClaim(lease, threadId, claim);
            return { disposition: "buffered", jobId, reason: "active_job" };
          }

          if (!(await this.verifyApplied(threadId, claim.pending))) {
            await this.releaseClaim(lease, threadId, claim);
            throw new Error(
              `Thread-read claim was not applied to existing job: ${threadId}`
            );
          }
          if (!(await this.acknowledge(lease, threadId, claim.raw))) {
            throw new Error(
              `Thread-read claim changed before acknowledgement: ${threadId}`
            );
          }
          return changed
            ? { disposition: "coalesced", jobId }
            : {
                disposition: "skipped",
                jobId,
                reason: "duplicate_trigger",
              };
        }

        await existing.remove();
        existing = undefined;
      }

      const added = await this.queue.add(
        THREAD_READ_JOB_NAME,
        { threadId, triggers: claim.pending.triggers },
        {
          delay: delayMs,
          jobId,
          priority: claim.pending.priority,
        }
      );

      if (!(await this.verifyApplied(threadId, claim.pending))) {
        await this.releaseClaim(lease, threadId, claim);
        throw new Error(
          `Thread-read claim was not applied to new job: ${threadId}`
        );
      }
      if (!(await this.acknowledge(lease, threadId, claim.raw))) {
        throw new Error(
          `Thread-read claim changed before acknowledgement: ${threadId}`
        );
      }

      if (existingState && isTerminalState(existingState)) {
        return {
          disposition: "scheduled",
          jobId: added.id ?? jobId,
          reason: "terminal_requeue",
        };
      }
      if (existingState === "unknown") {
        return {
          disposition: "scheduled",
          jobId: added.id ?? jobId,
          reason: "stale_requeue",
        };
      }
      return { disposition: "scheduled", jobId: added.id ?? jobId };
    } catch (error) {
      const stillClaimed = await this.redis.get(claimedKey(threadId));
      if (stillClaimed === claim.raw) {
        try {
          await this.releaseClaim(lease, threadId, claim);
        } catch {
          // A lost lease leaves the durable claim for its current owner or the
          // next recovery pass. Never let a stale owner overwrite newer state.
        }
      }
      throw error;
    }
  }

  private async drainAllUnderLock(
    lease: ThreadReadLockLease,
    threadId: string,
    delayMs: number
  ): Promise<ThreadReadEnqueueResult> {
    let accepted: ThreadReadEnqueueResult | null = null;
    while (true) {
      const result = await this.drainUnderLock(lease, threadId, delayMs);
      if (result.disposition === "buffered") {
        return result;
      }
      if (result.reason === "no_pending_triggers") {
        return accepted ?? result;
      }
      accepted = result;

      const [pending, claimed] = await Promise.all([
        this.redis.get(pendingKey(threadId)),
        this.redis.get(claimedKey(threadId)),
      ]);
      if (!(pending || claimed)) {
        return accepted;
      }
    }
  }

  async enqueue(
    threadId: string,
    triggers: readonly ThreadReadTrigger[],
    options: EnqueueThreadReadOptions = {}
  ): Promise<ThreadReadEnqueueResult> {
    if (triggers.length === 0) {
      return {
        disposition: "skipped",
        jobId: null,
        reason: "no_pending_triggers",
      };
    }
    const priority = THREAD_READ_PRIORITY_VALUES[options.priority ?? "normal"];
    const delay = options.delayMs ?? this.defaultDebounceMs;
    let persisted = false;
    try {
      return await this.withLock(threadId, async (lease) => {
        await this.buffer(lease, threadId, triggers, priority);
        persisted = true;
        return this.drainAllUnderLock(lease, threadId, delay);
      });
    } catch {
      return {
        disposition: persisted ? "buffered" : "skipped",
        jobId: null,
        reason: "queue_unavailable",
      };
    }
  }

  async drain(threadId: string): Promise<ThreadReadEnqueueResult> {
    return this.withLock(threadId, (lease) =>
      this.drainAllUnderLock(lease, threadId, 0)
    );
  }

  async recover(): Promise<ThreadReadEnqueueResult[]> {
    const threadIds = new Set<string>();
    for (const prefix of [PENDING_PREFIX, CLAIMED_PREFIX]) {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          "MATCH",
          `${prefix}*`,
          "COUNT",
          100
        );
        cursor = nextCursor;
        for (const key of keys) {
          threadIds.add(key.slice(prefix.length));
        }
      } while (cursor !== "0");
    }

    const results: ThreadReadEnqueueResult[] = [];
    for (const threadId of threadIds) {
      try {
        results.push(await this.drain(threadId));
      } catch {
        results.push({
          disposition: "skipped",
          jobId: null,
          reason: "queue_unavailable",
        });
      }
    }
    return results;
  }
}

let redisConnection: Redis | null = null;
let queue: Queue<ThreadReadJobData> | null = null;
let manager: ThreadReadQueueManager | null = null;
let ownsQueue = false;
let ownsRedisConnection = false;

const optionalIntegerString = (minimum: number, maximum?: number) =>
  z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(
      maximum === undefined
        ? z.number().int().min(minimum)
        : z.number().int().min(minimum).max(maximum)
    )
    .optional();

const redisEnvironmentSchema = z.object({
  NODE_ENV: z.string().optional(),
  REDIS_DB: optionalIntegerString(0),
  REDIS_HOST: z.string().min(1).optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_PORT: optionalIntegerString(1, 65_535),
  REDIS_URL: z.string().min(1).optional(),
});

export const createQueueRedisConnection = (
  settings: { allowLocalhostFallback?: boolean } = {}
): Redis | null => {
  const environment = redisEnvironmentSchema.parse(process.env);
  const redisOptions = {
    commandTimeout: QUEUE_COMMAND_TIMEOUT_MS,
    maxRetriesPerRequest: null,
  } as const;
  if (environment.REDIS_URL) {
    return new Redis(environment.REDIS_URL, redisOptions);
  }
  const redisHost =
    environment.REDIS_HOST ??
    (settings.allowLocalhostFallback !== false &&
    environment.NODE_ENV !== "production"
      ? "localhost"
      : undefined);
  if (!redisHost) {
    return null;
  }
  const options: {
    db?: number;
    host: string;
    commandTimeout: number;
    maxRetriesPerRequest: null;
    password?: string;
    port?: number;
  } = {
    commandTimeout: QUEUE_COMMAND_TIMEOUT_MS,
    host: redisHost,
    maxRetriesPerRequest: null,
  };
  if (environment.REDIS_PORT !== undefined) {
    options.port = environment.REDIS_PORT;
  }
  if (environment.REDIS_PASSWORD) {
    options.password = environment.REDIS_PASSWORD;
  }
  if (environment.REDIS_DB !== undefined) {
    options.db = environment.REDIS_DB;
  }
  return new Redis(options);
};

export const configureThreadReadQueue = (options: {
  connection: Redis;
  queue?: Queue<ThreadReadJobData>;
}): void => {
  if (manager || queue || redisConnection) {
    throw new Error("Thread-read queue has already been initialized");
  }
  redisConnection = options.connection;
  queue =
    options.queue ??
    new Queue<ThreadReadJobData>(THREAD_PIPELINE_QUEUE, {
      connection: options.connection,
      defaultJobOptions: THREAD_READ_DEFAULT_JOB_OPTIONS,
    });
  ownsQueue = options.queue === undefined;
  ownsRedisConnection = false;
};

export const closeThreadReadQueue = async (): Promise<void> => {
  const currentQueue = queue;
  const currentConnection = redisConnection;
  const shouldCloseQueue = ownsQueue;
  const shouldCloseConnection = ownsRedisConnection;

  manager = null;
  queue = null;
  redisConnection = null;
  ownsQueue = false;
  ownsRedisConnection = false;

  try {
    if (shouldCloseQueue) {
      await currentQueue?.close();
    }
  } finally {
    if (shouldCloseConnection) {
      await currentConnection?.quit();
    }
  }
};

const createManager = (
  currentQueue: Queue<ThreadReadJobData>,
  currentConnection: Redis
): ThreadReadQueueManager =>
  new ThreadReadQueueManager(
    {
      add: (name, data, options) => currentQueue.add(name, data, options),
      getJob: (jobId) => currentQueue.getJob(jobId),
    },
    {
      del: (...keys) => currentConnection.del(...keys),
      eval: (script, numberOfKeys, ...args) =>
        currentConnection.eval(script, numberOfKeys, ...args),
      get: (key) => currentConnection.get(key),
      incr: (key) => currentConnection.incr(key),
      scan: (cursor, matchToken, pattern, countToken, count) =>
        currentConnection.scan(cursor, matchToken, pattern, countToken, count),
      set: (key, value, ...args) => {
        if (args.length === 0) {
          return currentConnection.set(key, value);
        }
        const ttl = args[1];
        if (args[0] !== "PX" || typeof ttl !== "number" || args[2] !== "NX") {
          throw new Error("Unsupported thread-read Redis SET options");
        }
        return currentConnection.set(key, value, "PX", ttl, "NX");
      },
    },
    (() => {
      const raw = process.env.THREAD_READ_DEBOUNCE_MS;
      if (!raw) {
        return DEFAULT_DEBOUNCE_MS;
      }
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) && parsed >= 0
        ? parsed
        : DEFAULT_DEBOUNCE_MS;
    })()
  );

const getManager = (): ThreadReadQueueManager | null => {
  if (manager) {
    return manager;
  }
  if (!redisConnection) {
    redisConnection = createQueueRedisConnection();
    ownsRedisConnection = Boolean(redisConnection);
  }
  if (!redisConnection) {
    return null;
  }
  if (!queue) {
    queue = new Queue<ThreadReadJobData>(THREAD_PIPELINE_QUEUE, {
      connection: redisConnection,
      defaultJobOptions: THREAD_READ_DEFAULT_JOB_OPTIONS,
    });
    ownsQueue = true;
  }
  const currentQueue = queue;
  const currentConnection = redisConnection;
  manager = createManager(currentQueue, currentConnection);
  return manager;
};

export const enqueueThreadRead = async (
  threadId: string,
  trigger: ThreadReadTrigger,
  options?: EnqueueThreadReadOptions
): Promise<ThreadReadEnqueueResult> => {
  const current = getManager();
  if (!current) {
    return {
      disposition: "skipped",
      jobId: null,
      reason: "queue_unavailable",
    };
  }
  return current.enqueue(threadId, [trigger], options);
};

export const drainPendingThreadRead = async (
  threadId: string
): Promise<ThreadReadEnqueueResult> => {
  const current = getManager();
  if (!current) {
    return {
      disposition: "skipped",
      jobId: null,
      reason: "queue_unavailable",
    };
  }
  return current.drain(threadId);
};

export const recoverPendingThreadReads = async (): Promise<
  ThreadReadEnqueueResult[]
> => {
  const current = getManager();
  return current ? current.recover() : [];
};
