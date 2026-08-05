import type { ThreadReadJobData } from "@workspace/schemas/signals";
import type { JobState } from "bullmq";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThreadReadQueueManager } from "./thread-read";
import type {
  ThreadReadQueueAdapter,
  ThreadReadRedisAdapter,
} from "./thread-read";

class FakeRedis implements ThreadReadRedisAdapter {
  failLockForThreadIds = new Set<string>();
  failNextGet = false;
  onGet?: (key: string) => void;
  readonly values = new Map<string, string>();

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      removed += this.values.delete(key) ? 1 : 0;
    }
    return removed;
  }

  async eval(
    _script: string,
    numberOfKeys: number,
    ...args: (string | number)[]
  ): Promise<unknown> {
    const keys = args.slice(0, numberOfKeys).map(String);
    const argv = args.slice(numberOfKeys).map(String);
    if (numberOfKeys === 3 && argv.length === 1) {
      const [pending, claimed, lock] = keys;
      if (!(pending && claimed && lock)) return null;
      if (this.values.get(lock) !== argv[0]) return "__LOCK_LOST__";
      const existingClaim = this.values.get(claimed);
      if (existingClaim) return existingClaim;
      const value = this.values.get(pending);
      if (!value) return null;
      this.values.set(claimed, value);
      this.values.delete(pending);
      return value;
    }

    if (numberOfKeys === 3 && argv.length === 4) {
      const [lock, pending, claimed] = keys;
      if (!(lock && pending && claimed)) return -1;
      if (this.values.get(lock) !== argv[0]) return -1;
      const currentPending = this.values.get(pending);
      if (
        (argv[1] === "" && currentPending !== undefined) ||
        (argv[1] !== "" && currentPending !== argv[1])
      ) {
        return -2;
      }
      if (this.values.get(claimed) !== argv[2]) return -3;
      this.values.set(pending, argv[3] ?? "");
      this.values.delete(claimed);
      return 1;
    }

    if (numberOfKeys === 2 && argv.length === 3) {
      const [lock, pending] = keys;
      if (!(lock && pending)) return -1;
      if (this.values.get(lock) !== argv[0]) return -1;
      const current = this.values.get(pending);
      if (
        (argv[1] === "" && current !== undefined) ||
        (argv[1] !== "" && current !== argv[1])
      ) {
        return -2;
      }
      this.values.set(pending, argv[2] ?? "");
      return 1;
    }

    if (numberOfKeys === 2 && argv.length === 2) {
      const [claimed, lock] = keys;
      if (!(claimed && lock)) return -1;
      if (this.values.get(lock) !== argv[0]) return -1;
      if (this.values.get(claimed) !== argv[1]) return 0;
      this.values.delete(claimed);
      return 1;
    }

    const [key] = keys;
    if (!key) return 0;
    if (argv.length === 2) {
      return this.values.get(key) === argv[0] ? 1 : 0;
    }
    if (this.values.get(key) === argv[0]) {
      this.values.delete(key);
      return 1;
    }
    return 0;
  }

  async get(key: string): Promise<string | null> {
    if (this.failNextGet) {
      this.failNextGet = false;
      throw new Error("redis unavailable");
    }
    const value = this.values.get(key) ?? null;
    this.onGet?.(key);
    return value;
  }

  async incr(key: string): Promise<number> {
    const next = Number(this.values.get(key) ?? "0") + 1;
    this.values.set(key, String(next));
    return next;
  }

  async scan(
    _cursor: string,
    _matchToken: "MATCH",
    pattern: string,
    _countToken: "COUNT",
    _count: number
  ): Promise<[string, string[]]> {
    const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
    return [
      "0",
      [...this.values.keys()].filter((key) => key.startsWith(prefix)),
    ];
  }

  async set(
    key: string,
    value: string,
    ...args: (string | number)[]
  ): Promise<unknown> {
    if (
      args.includes("NX") &&
      [...this.failLockForThreadIds].some((threadId) => key.endsWith(threadId))
    ) {
      throw new Error("lock unavailable");
    }
    if (args.includes("NX") && this.values.has(key)) return null;
    this.values.set(key, value);
    return "OK";
  }
}

class FakeJob {
  activateOnUpdate = false;
  data: ThreadReadJobData;
  id: string;
  opts: { delay?: number; priority?: number };
  private readonly owner: FakeQueue;
  onUpdate?: () => void;
  state: JobState | "unknown";
  updateGate?: Promise<void>;

  constructor(
    owner: FakeQueue,
    id: string,
    data: ThreadReadJobData,
    state: JobState | "unknown",
    priority: number,
    delay = 0
  ) {
    this.owner = owner;
    this.id = id;
    this.data = data;
    this.state = state;
    this.opts = { delay, priority };
  }

  async changePriority(options: { priority?: number }): Promise<void> {
    this.opts.priority = options.priority;
  }

  async getState(): Promise<JobState | "unknown"> {
    return this.state;
  }

  async remove(): Promise<void> {
    this.owner.jobs.delete(this.id);
  }

  async updateData(data: ThreadReadJobData): Promise<void> {
    await this.updateGate;
    this.data = data;
    this.onUpdate?.();
    if (this.activateOnUpdate) {
      this.state = "active";
    }
  }
}

class FakeQueue implements ThreadReadQueueAdapter {
  readonly jobs = new Map<string, FakeJob>();
  failNextAdd = false;

  async add(
    _name: string,
    data: ThreadReadJobData,
    options: { delay: number; jobId: string; priority: number }
  ): Promise<FakeJob> {
    if (this.failNextAdd) {
      this.failNextAdd = false;
      throw new Error("queue unavailable");
    }
    const existing = this.jobs.get(options.jobId);
    if (existing) return existing;
    const job = new FakeJob(
      this,
      options.jobId,
      data,
      options.delay > 0 ? "delayed" : "waiting",
      options.priority,
      options.delay
    );
    this.jobs.set(options.jobId, job);
    return job;
  }

  async getJob(jobId: string): Promise<FakeJob | undefined> {
    return this.jobs.get(jobId);
  }
}

const prTrigger = (prId: string, score = 0.8) => ({
  kind: "pr_matched" as const,
  prMatched: {
    prId,
    score,
    title: prId,
    url: `https://example.com/${prId}`,
  },
});

const setup = () => {
  const queue = new FakeQueue();
  const redis = new FakeRedis();
  return {
    manager: new ThreadReadQueueManager(queue, redis, 10),
    queue,
    redis,
  };
};

describe(ThreadReadQueueManager, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces delayed causes, preserves PR candidates, and promotes priority", async () => {
    const { manager, queue } = setup();

    await expect(
      manager.enqueue("t1", [prTrigger("pr-1")], { priority: "low" })
    ).resolves.toMatchObject({ disposition: "scheduled" });
    await expect(
      manager.enqueue("t1", [{ kind: "message" }], { priority: "high" })
    ).resolves.toMatchObject({ disposition: "coalesced" });
    await expect(
      manager.enqueue("t1", [prTrigger("pr-2")])
    ).resolves.toMatchObject({
      disposition: "coalesced",
    });

    const job = queue.jobs.get("thread:t1:read");
    expect(job?.data.triggers).toStrictEqual([
      prTrigger("pr-1"),
      { kind: "message" },
      prTrigger("pr-2"),
    ]);
    expect(job?.opts.priority).toBe(1);
  });

  it("reports a duplicate trigger without mutating the stable job", async () => {
    const { manager } = setup();
    await manager.enqueue("t1", [{ kind: "message" }]);

    await expect(
      manager.enqueue("t1", [{ kind: "message" }])
    ).resolves.toMatchObject({
      disposition: "skipped",
      reason: "duplicate_trigger",
    });
  });

  it("buffers active-job causes and schedules one follow-up after completion", async () => {
    const { manager, queue } = setup();
    await manager.enqueue("t1", [prTrigger("pr-1")]);
    const active = queue.jobs.get("thread:t1:read");
    if (!active) throw new Error("missing test job");
    active.state = "active";

    await expect(
      manager.enqueue("t1", [{ kind: "message" }])
    ).resolves.toMatchObject({
      disposition: "buffered",
      reason: "active_job",
    });

    active.state = "completed";
    await expect(manager.drain("t1")).resolves.toMatchObject({
      disposition: "scheduled",
      reason: "terminal_requeue",
    });
    expect(queue.jobs.get("thread:t1:read")?.data.triggers).toStrictEqual([
      { kind: "message" },
    ]);
  });

  it("buffers when a waiting job becomes active during payload mutation", async () => {
    const { manager, queue, redis } = setup();
    await manager.enqueue("t1", [{ kind: "message" }]);
    const racingJob = queue.jobs.get("thread:t1:read");
    if (!racingJob) throw new Error("missing test job");
    racingJob.state = "waiting";
    racingJob.activateOnUpdate = true;

    await expect(
      manager.enqueue("t1", [prTrigger("pr-1")])
    ).resolves.toMatchObject({
      disposition: "buffered",
      reason: "active_job",
    });
    expect(redis.values.has("frontdesk:thread-read-pending:t1")).toBeTruthy();

    racingJob.activateOnUpdate = false;
    racingJob.state = "completed";
    await expect(manager.drain("t1")).resolves.toMatchObject({
      disposition: "scheduled",
      reason: "terminal_requeue",
    });
    expect(queue.jobs.get("thread:t1:read")?.data.triggers).toStrictEqual([
      prTrigger("pr-1"),
    ]);
  });

  it("fences a stale owner from overwriting a newer pending generation", async () => {
    const { manager, queue, redis } = setup();
    await manager.enqueue("t1", [{ kind: "message" }]);
    const racingJob = queue.jobs.get("thread:t1:read");
    if (!racingJob) throw new Error("missing test job");
    racingJob.state = "waiting";
    racingJob.activateOnUpdate = true;

    const newerPending = JSON.stringify({
      generation: 99,
      priority: 1,
      triggers: [{ kind: "sla" }],
    });
    redis.onGet = (key) => {
      if (
        key === "frontdesk:thread-read-pending:t1" &&
        redis.values.has("frontdesk:thread-read-claimed:t1")
      ) {
        redis.onGet = undefined;
        redis.values.set("frontdesk:thread-read-enqueue:t1", "new-owner");
        redis.values.set(key, newerPending);
      }
    };

    await expect(
      manager.enqueue("t1", [prTrigger("pr-1")])
    ).resolves.toMatchObject({
      disposition: "buffered",
      reason: "queue_unavailable",
    });
    expect(redis.values.get("frontdesk:thread-read-pending:t1")).toBe(
      newerPending
    );
    expect(redis.values.has("frontdesk:thread-read-claimed:t1")).toBeTruthy();
  });

  it.each([
    ["completed", "terminal_requeue"],
    ["failed", "terminal_requeue"],
    ["unknown", "stale_requeue"],
  ] as const)(
    "removes a %s stable-id record before requeueing",
    async (state, reason) => {
      const { manager, queue } = setup();
      queue.jobs.set(
        "thread:t1:read",
        new FakeJob(
          queue,
          "thread:t1:read",
          { threadId: "t1", triggers: [{ kind: "message" }] },
          state,
          10
        )
      );

      await expect(
        manager.enqueue("t1", [prTrigger("pr-1")])
      ).resolves.toMatchObject({ disposition: "scheduled", reason });
      expect(queue.jobs.get("thread:t1:read")?.data.triggers).toStrictEqual([
        prTrigger("pr-1"),
      ]);
    }
  );

  it("restores a claimed generation when BullMQ mutation fails", async () => {
    const { manager, queue, redis } = setup();
    queue.failNextAdd = true;

    await expect(
      manager.enqueue("t1", [{ kind: "message" }])
    ).resolves.toMatchObject({
      disposition: "buffered",
      reason: "queue_unavailable",
    });
    expect(redis.values.has("frontdesk:thread-read-pending:t1")).toBeTruthy();
    expect(redis.values.has("frontdesk:thread-read-claimed:t1")).toBeFalsy();

    await expect(manager.recover()).resolves.toHaveLength(1);
    expect(queue.jobs.get("thread:t1:read")?.data.triggers).toStrictEqual([
      { kind: "message" },
    ]);
  });

  it("returns a structured unavailable result when durable buffering fails", async () => {
    const { manager, redis } = setup();
    redis.failNextGet = true;

    await expect(
      manager.enqueue("t1", [{ kind: "message" }])
    ).resolves.toMatchObject({
      disposition: "skipped",
      reason: "queue_unavailable",
    });
  });

  it("rejects empty trigger input before writing a durable generation", async () => {
    const { manager, queue, redis } = setup();

    await expect(manager.enqueue("t1", [])).resolves.toStrictEqual({
      disposition: "skipped",
      jobId: null,
      reason: "no_pending_triggers",
    });
    expect(queue.jobs.size).toBe(0);
    expect(redis.values.size).toBe(0);
  });

  it("rejects malformed pending trigger records at the Redis boundary", async () => {
    const { manager, queue, redis } = setup();
    redis.values.set(
      "frontdesk:thread-read-pending:t1",
      JSON.stringify({
        generation: 1,
        priority: 10,
        triggers: [{ kind: "not_a_trigger" }],
      })
    );

    await expect(manager.recover()).resolves.toStrictEqual([
      expect.objectContaining({
        disposition: "skipped",
        reason: "queue_unavailable",
      }),
    ]);
    expect(queue.jobs.size).toBe(0);
  });

  it("acknowledges a crash-left claim only after verifying the BullMQ payload", async () => {
    const { manager, queue, redis } = setup();
    const raw = JSON.stringify({
      generation: 1,
      priority: 10,
      triggers: [prTrigger("pr-1")],
    });
    redis.values.set("frontdesk:thread-read-claimed:t1", raw);
    queue.jobs.set(
      "thread:t1:read",
      new FakeJob(
        queue,
        "thread:t1:read",
        { threadId: "t1", triggers: [prTrigger("pr-1")] },
        "waiting",
        10
      )
    );

    await expect(manager.recover()).resolves.toStrictEqual([
      expect.objectContaining({
        disposition: "skipped",
        reason: "duplicate_trigger",
      }),
    ]);
    expect(redis.values.has("frontdesk:thread-read-claimed:t1")).toBeFalsy();
  });

  it("drains a stale claim and a newer pending generation in one recovery", async () => {
    const { manager, queue, redis } = setup();
    redis.values.set(
      "frontdesk:thread-read-claimed:t1",
      JSON.stringify({
        generation: 1,
        priority: 10,
        triggers: [{ kind: "message" }],
      })
    );
    redis.values.set(
      "frontdesk:thread-read-pending:t1",
      JSON.stringify({
        generation: 2,
        priority: 10,
        triggers: [prTrigger("pr-1")],
      })
    );
    queue.jobs.set(
      "thread:t1:read",
      new FakeJob(
        queue,
        "thread:t1:read",
        { threadId: "t1", triggers: [{ kind: "message" }] },
        "waiting",
        10
      )
    );

    await expect(manager.recover()).resolves.toStrictEqual([
      expect.objectContaining({ disposition: "coalesced" }),
    ]);
    expect(queue.jobs.get("thread:t1:read")?.data.triggers).toStrictEqual([
      { kind: "message" },
      prTrigger("pr-1"),
    ]);
    expect(redis.values.has("frontdesk:thread-read-claimed:t1")).toBeFalsy();
    expect(redis.values.has("frontdesk:thread-read-pending:t1")).toBeFalsy();
  });

  it("continues recovery when one thread cannot acquire its lock", async () => {
    const { manager, queue, redis } = setup();
    for (const threadId of ["t1", "t2"]) {
      redis.values.set(
        `frontdesk:thread-read-pending:${threadId}`,
        JSON.stringify({
          generation: 1,
          priority: 10,
          triggers: [{ kind: "message" }],
        })
      );
    }
    redis.failLockForThreadIds.add("t1");

    await expect(manager.recover()).resolves.toStrictEqual([
      expect.objectContaining({
        disposition: "skipped",
        reason: "queue_unavailable",
      }),
      expect.objectContaining({ disposition: "scheduled" }),
    ]);
    expect(queue.jobs.has("thread:t2:read")).toBeTruthy();
  });

  it("retains its lease until a slow queue mutation settles", async () => {
    vi.useFakeTimers();
    const { manager, queue, redis } = setup();
    await manager.enqueue("t1", [{ kind: "message" }]);
    const slowJob = queue.jobs.get("thread:t1:read");
    if (!slowJob) throw new Error("missing test job");

    let releaseUpdate: (() => void) | undefined;
    slowJob.updateGate = new Promise((resolve) => {
      releaseUpdate = resolve;
    });

    const slowEnqueue = manager.enqueue("t1", [prTrigger("pr-1")]);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(redis.values.has("frontdesk:thread-read-enqueue:t1")).toBeTruthy();

    let newerSettled = false;
    const newerEnqueue = manager
      .enqueue("t1", [{ kind: "sla" }])
      .finally(() => {
        newerSettled = true;
      });
    await vi.advanceTimersByTimeAsync(100);
    expect(newerSettled).toBeFalsy();

    slowJob.updateGate = undefined;
    releaseUpdate?.();
    await vi.advanceTimersByTimeAsync(0);
    await expect(slowEnqueue).resolves.toMatchObject({
      disposition: "coalesced",
    });

    await vi.advanceTimersByTimeAsync(25);
    await expect(newerEnqueue).resolves.toMatchObject({
      disposition: "coalesced",
    });
    expect(queue.jobs.get("thread:t1:read")?.data.triggers).toStrictEqual([
      { kind: "message" },
      prTrigger("pr-1"),
      { kind: "sla" },
    ]);
  });

  it("serializes concurrent enqueues into one stable job without dropping causes", async () => {
    const { manager, queue } = setup();
    await Promise.all([
      manager.enqueue("t1", [prTrigger("pr-1")]),
      manager.enqueue("t1", [prTrigger("pr-2")]),
      manager.enqueue("t1", [{ kind: "sla" }]),
    ]);

    expect(queue.jobs.size).toBe(1);
    expect(queue.jobs.get("thread:t1:read")?.data.triggers).toStrictEqual([
      prTrigger("pr-1"),
      prTrigger("pr-2"),
      { kind: "sla" },
    ]);
  });
});
