import { beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => {
  class FakeRedis {
    static values = new Map<string, string>();
    static failNextDelete = false;
    values = FakeRedis.values;

    async set(
      key: string,
      value: string,
      ...args: (string | number)[]
    ): Promise<"OK" | null> {
      if (args.includes("NX") && this.values.has(key)) {
        return null;
      }
      this.values.set(key, value);
      return "OK";
    }

    async get(key: string): Promise<string | null> {
      return this.values.get(key) ?? null;
    }

    async del(key: string): Promise<number> {
      if (FakeRedis.failNextDelete) {
        FakeRedis.failNextDelete = false;
        throw new Error("simulated pending-state acknowledgement failure");
      }
      return this.values.delete(key) ? 1 : 0;
    }

    async eval(
      script: string,
      _keyCount: number,
      key: string,
      token: string,
      _ttl?: string
    ): Promise<number> {
      if (this.values.get(key) !== token) {
        return 0;
      }
      if (script.includes("pexpire")) {
        return 1;
      }
      this.values.delete(key);
      return 1;
    }

    async scan(
      _cursor: string,
      _match: string,
      pattern: string,
      _count: string,
      _countValue: string
    ): Promise<[string, string[]]> {
      const prefix = pattern.replace(/\*$/, "");
      return [
        "0",
        [...this.values.keys()].filter((key) => key.startsWith(prefix)),
      ];
    }
  }

  class FakeJob {
    attemptsMade = 0;
    data: unknown;
    finishedOn?: number;
    id: string;
    name: string;
    opts: { attempts?: number; delay?: number; priority?: number };
    processedOn?: number;
    state: string;
    timestamp = Date.now();

    constructor(
      id: string,
      name: string,
      data: unknown,
      opts: { attempts?: number; delay?: number; priority?: number },
      state: string
    ) {
      this.data = data;
      this.id = id;
      this.name = name;
      this.opts = opts;
      this.state = state;
    }

    async getState(): Promise<string> {
      return this.state;
    }

    async updateData(data: unknown): Promise<void> {
      this.data = data;
    }

    async changePriority(opts: { priority: number }): Promise<void> {
      this.opts.priority = opts.priority;
    }

    async remove(): Promise<void> {
      const queue = FakeQueue.instances.find((candidate) =>
        candidate.jobs.has(this.id)
      );
      queue?.jobs.delete(this.id);
    }
  }

  class FakeQueue {
    static instances: FakeQueue[] = [];
    static failAddThreadIds = new Set<string>();
    jobs = new Map<string, FakeJob>();
    addCalls = 0;

    constructor(..._args: unknown[]) {
      FakeQueue.instances.push(this);
    }

    async getJob(id: string): Promise<FakeJob | undefined> {
      return this.jobs.get(id);
    }

    async add(
      name: string,
      data: unknown,
      opts: { delay?: number; jobId?: string; priority?: number }
    ): Promise<FakeJob> {
      this.addCalls += 1;
      const threadId =
        typeof data === "object" && data !== null && "threadId" in data
          ? data.threadId
          : undefined;
      if (
        typeof threadId === "string" &&
        FakeQueue.failAddThreadIds.has(threadId)
      ) {
        throw new Error(`simulated queue failure for ${threadId}`);
      }
      const id = opts.jobId ?? `job-${this.jobs.size + 1}`;
      const duplicate = this.jobs.get(id);
      if (duplicate) {
        // BullMQ ignores duplicate custom IDs and leaves the existing job in
        // place. Keep the fake aligned so stale-record tests are meaningful.
        return duplicate;
      }
      const job = new FakeJob(
        id,
        name,
        data,
        opts,
        opts.delay && opts.delay > 0 ? "delayed" : "waiting"
      );
      this.jobs.set(id, job);
      return job;
    }
  }

  return { FakeQueue, FakeRedis };
});

vi.mock(import("bullmq"), () => ({ Queue: fakes.FakeQueue }));
vi.mock(import("ioredis"), () => ({ default: fakes.FakeRedis }));

process.env.NODE_ENV = "test";
process.env.REDIS_HOST = "fake";

const { drainPendingThreadRead, enqueueThreadRead, recoverPendingThreadReads } =
  await import("./queue");

const pr = (prId: string, score = 0.9) => ({
  prId,
  score,
  title: `PR ${prId}`,
  url: `https://github.com/acme/app/pull/${prId}`,
});

const getQueue = () => {
  const queue = fakes.FakeQueue.instances.at(-1);
  if (!queue) throw new Error("Fake queue was not created");
  return queue;
};

describe("thread-read enqueue lifecycle", () => {
  beforeEach(() => {
    fakes.FakeRedis.values.clear();
    fakes.FakeRedis.failNextDelete = false;
    const queue = fakes.FakeQueue.instances.at(-1);
    queue?.jobs.clear();
    if (queue) queue.addCalls = 0;
    fakes.FakeQueue.failAddThreadIds.clear();
  });

  it("coalesces delayed triggers into one job", async () => {
    const first = await enqueueThreadRead("thread-delayed", {
      delayMs: 1000,
      kind: "message",
    });
    const second = await enqueueThreadRead("thread-delayed", {
      delayMs: 1000,
      kind: "pr_matched",
      prMatched: pr("pr-1"),
    });

    expect(first.disposition).toBe("scheduled");
    expect(second.disposition).toBe("coalesced");
    expect(
      getQueue().jobs.get("thread:thread-delayed:read")?.data
    ).toStrictEqual({
      threadId: "thread-delayed",
      triggers: [
        { kind: "message" },
        { kind: "pr_matched", prMatched: pr("pr-1") },
      ],
    });
  });

  it("promotes a coalesced job when a higher priority trigger arrives", async () => {
    await enqueueThreadRead("thread-priority", {
      delayMs: 1000,
      kind: "message",
      priority: "low",
    });

    const result = await enqueueThreadRead("thread-priority", {
      kind: "message",
      priority: "high",
    });

    expect(result.disposition).toBe("coalesced");
    expect(
      getQueue().jobs.get("thread:thread-priority:read")?.opts.priority
    ).toBe(1);
  });

  it("models BullMQ duplicate custom IDs as the existing job", async () => {
    await enqueueThreadRead("thread-duplicate", {
      delayMs: 0,
      kind: "message",
    });
    const queue = getQueue();
    const existing = queue.jobs.get("thread:thread-duplicate:read");
    if (!existing) throw new Error("Duplicate test job was not created");

    const duplicate = await queue.add(
      "thread-read",
      { threadId: "thread-duplicate", triggers: [{ kind: "manual" }] },
      { jobId: "thread:thread-duplicate:read" }
    );

    expect(duplicate).toBe(existing);
    expect(queue.jobs.size).toBe(1);
  });

  it("buffers active triggers and schedules one follow-up after completion", async () => {
    await enqueueThreadRead("thread-active", {
      delayMs: 0,
      kind: "message",
    });
    const active = getQueue().jobs.get("thread:thread-active:read");
    if (!active) throw new Error("Active test job was not created");
    active.state = "active";

    const buffered = await enqueueThreadRead("thread-active", {
      kind: "pr_matched",
      prMatched: pr("pr-1"),
    });
    expect(buffered.disposition).toBe("buffered");
    expect(buffered.generation).toBe(1);

    active.state = "completed";
    const drained = await drainPendingThreadRead("thread-active");

    expect(drained?.disposition).toBe("scheduled");
    expect(
      getQueue().jobs.get("thread:thread-active:read")?.data
    ).toStrictEqual({
      threadId: "thread-active",
      triggers: [{ kind: "pr_matched", prMatched: pr("pr-1") }],
    });
    expect(
      [...fakes.FakeRedis.values.keys()].some((key) =>
        key.startsWith("frontdesk:thread-read-pending:")
      )
    ).toBeFalsy();
  });

  it("does not create a follow-up for an identical active trigger", async () => {
    await enqueueThreadRead("thread-idempotent", {
      delayMs: 0,
      kind: "pr_matched",
      prMatched: pr("pr-1"),
    });
    const active = getQueue().jobs.get("thread:thread-idempotent:read");
    if (!active) throw new Error("Idempotency test job was not created");
    active.state = "active";

    const duplicate = await enqueueThreadRead("thread-idempotent", {
      kind: "pr_matched",
      prMatched: pr("pr-1"),
    });

    expect(duplicate).toStrictEqual({
      disposition: "coalesced",
      jobId: "thread:thread-idempotent:read",
      reason: "duplicate_trigger",
    });
    await expect(
      drainPendingThreadRead("thread-idempotent")
    ).resolves.toBeNull();
  });

  it("requeues a trigger after a terminal job record", async () => {
    await enqueueThreadRead("thread-terminal", {
      delayMs: 0,
      kind: "message",
    });
    const job = getQueue().jobs.get("thread:thread-terminal:read");
    if (!job) throw new Error("Terminal test job was not created");
    job.state = "failed";

    const result = await enqueueThreadRead("thread-terminal", {
      kind: "manual",
    });

    expect(result.disposition).toBe("scheduled");
    expect(result.reason).toBe("terminal_job_requeued");
    expect(getQueue().jobs.get("thread:thread-terminal:read")?.state).toBe(
      "delayed"
    );
  });

  it("removes an unknown stale job before requeueing", async () => {
    await enqueueThreadRead("thread-unknown", {
      delayMs: 0,
      kind: "message",
    });
    const job = getQueue().jobs.get("thread:thread-unknown:read");
    if (!job) throw new Error("Unknown-state test job was not created");
    job.state = "unknown";

    const result = await enqueueThreadRead("thread-unknown", {
      kind: "manual",
    });

    expect(result).toMatchObject({
      disposition: "scheduled",
      reason: "stale_job_requeued",
    });
    expect(
      getQueue().jobs.get("thread:thread-unknown:read")?.data
    ).toStrictEqual({
      threadId: "thread-unknown",
      triggers: [{ kind: "manual" }],
    });
  });

  it("does not replay a claimed follow-up when acknowledgement fails", async () => {
    await enqueueThreadRead("thread-ack", {
      delayMs: 0,
      kind: "message",
    });
    const active = getQueue().jobs.get("thread:thread-ack:read");
    if (!active) throw new Error("Acknowledgement test job was not created");
    active.state = "active";
    await enqueueThreadRead("thread-ack", {
      kind: "pr_matched",
      prMatched: pr("pr-ack"),
    });

    active.state = "completed";
    fakes.FakeRedis.failNextDelete = true;
    const firstDrain = await drainPendingThreadRead("thread-ack");
    expect(firstDrain?.disposition).toBe("scheduled");

    const followUp = getQueue().jobs.get("thread:thread-ack:read");
    if (!followUp) throw new Error("Follow-up job was not created");
    followUp.state = "completed";
    const secondDrain = await drainPendingThreadRead("thread-ack");

    expect(secondDrain?.disposition).toBe("coalesced");
    expect(getQueue().addCalls).toBe(2);
    expect(
      [...fakes.FakeRedis.values.keys()].some((key) =>
        key.startsWith("frontdesk:thread-read-pending:")
      )
    ).toBeFalsy();
  });

  it("retries a claimed generation when its job is missing", async () => {
    fakes.FakeRedis.values.set(
      "frontdesk:thread-read-pending:thread-claimed-missing",
      JSON.stringify({
        claimedAt: Date.now(),
        claimedGeneration: 1,
        generation: 1,
        priority: "normal",
        triggers: [{ kind: "message" }],
      })
    );

    const result = await drainPendingThreadRead("thread-claimed-missing");

    expect(result?.disposition).toBe("scheduled");
    expect(
      getQueue().jobs.get("thread:thread-claimed-missing:read")?.state
    ).toBe("waiting");
    expect(
      fakes.FakeRedis.values.has(
        "frontdesk:thread-read-pending:thread-claimed-missing"
      )
    ).toBeFalsy();
  });

  it("merges a claimed generation that was not written to the job payload", async () => {
    await enqueueThreadRead("thread-claimed-payload", {
      delayMs: 0,
      kind: "message",
    });
    fakes.FakeRedis.values.set(
      "frontdesk:thread-read-pending:thread-claimed-payload",
      JSON.stringify({
        claimedAt: Date.now(),
        claimedGeneration: 1,
        generation: 1,
        priority: "high",
        triggers: [{ kind: "pr_matched", prMatched: pr("pr-claimed") }],
      })
    );

    const result = await drainPendingThreadRead("thread-claimed-payload");

    expect(result?.disposition).toBe("coalesced");
    expect(
      getQueue().jobs.get("thread:thread-claimed-payload:read")?.data
    ).toStrictEqual({
      threadId: "thread-claimed-payload",
      triggers: [
        { kind: "message" },
        { kind: "pr_matched", prMatched: pr("pr-claimed") },
      ],
    });
    expect(
      getQueue().jobs.get("thread:thread-claimed-payload:read")?.opts.priority
    ).toBe(1);
    expect(
      fakes.FakeRedis.values.has(
        "frontdesk:thread-read-pending:thread-claimed-payload"
      )
    ).toBeFalsy();
  });

  it("serializes concurrent active enqueues into one pending generation", async () => {
    await enqueueThreadRead("thread-concurrent", {
      delayMs: 0,
      kind: "message",
    });
    const active = getQueue().jobs.get("thread:thread-concurrent:read");
    if (!active) throw new Error("Concurrent test job was not created");
    active.state = "active";

    const results = await Promise.all([
      enqueueThreadRead("thread-concurrent", {
        kind: "pr_matched",
        prMatched: pr("pr-1"),
      }),
      enqueueThreadRead("thread-concurrent", {
        kind: "pr_matched",
        prMatched: pr("pr-2"),
      }),
    ]);

    expect(results.map((result) => result.disposition).sort()).toStrictEqual([
      "buffered",
      "buffered",
    ]);
    expect(results.map((result) => result.generation).sort()).toStrictEqual([
      1, 2,
    ]);

    active.state = "completed";
    await drainPendingThreadRead("thread-concurrent");
    expect(
      getQueue().jobs.get("thread:thread-concurrent:read")?.data
    ).toStrictEqual({
      threadId: "thread-concurrent",
      triggers: [
        { kind: "pr_matched", prMatched: pr("pr-1") },
        { kind: "pr_matched", prMatched: pr("pr-2") },
      ],
    });
  });

  it("recovers pending threads independently when one enqueue fails", async () => {
    const bufferTrigger = async (threadId: string, prId: string) => {
      await enqueueThreadRead(threadId, { delayMs: 0, kind: "message" });
      const active = getQueue().jobs.get(`thread:${threadId}:read`);
      if (!active) throw new Error(`Missing active job for ${threadId}`);
      active.state = "active";
      await enqueueThreadRead(threadId, {
        kind: "pr_matched",
        prMatched: pr(prId),
      });
      active.state = "completed";
    };

    await bufferTrigger("thread-recovery-fail", "pr-recovery-fail");
    await bufferTrigger("thread-recovery-good", "pr-recovery-good");
    fakes.FakeQueue.failAddThreadIds.add("thread-recovery-fail");

    await expect(recoverPendingThreadReads()).resolves.toBe(1);
    expect(getQueue().jobs.get("thread:thread-recovery-good:read")?.state).toBe(
      "waiting"
    );
    expect(
      [...fakes.FakeRedis.values.keys()].some((key) =>
        key.endsWith("thread-recovery-fail")
      )
    ).toBeTruthy();

    fakes.FakeQueue.failAddThreadIds.delete("thread-recovery-fail");
    await expect(recoverPendingThreadReads()).resolves.toBe(1);
    expect(
      [...fakes.FakeRedis.values.keys()].some((key) =>
        key.endsWith("thread-recovery-fail")
      )
    ).toBeFalsy();
  });

  it("reports disabled worker enqueueing without touching Redis", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    vi.resetModules();

    try {
      const { enqueueThreadRead: productionEnqueueThreadRead } =
        await import("./queue");
      await expect(
        productionEnqueueThreadRead("thread-disabled", {
          kind: "message",
        })
      ).resolves.toStrictEqual({
        disposition: "skipped",
        jobId: null,
        reason: "worker_disabled",
      });
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      vi.resetModules();
    }
  });
});
