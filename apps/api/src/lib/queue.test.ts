import { beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => {
  class FakeRedis {
    static values = new Map<string, string>();
    values = FakeRedis.values;

    async set(
      key: string,
      value: string,
      ...args: string[]
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
      return this.values.delete(key) ? 1 : 0;
    }

    async eval(
      _script: string,
      _keyCount: number,
      key: string,
      token: string
    ): Promise<number> {
      if (this.values.get(key) !== token) {
        return 0;
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

    async remove(): Promise<void> {
      const queue = FakeQueue.instances.find((candidate) =>
        candidate.jobs.has(this.id)
      );
      queue?.jobs.delete(this.id);
    }
  }

  class FakeQueue {
    static instances: FakeQueue[] = [];
    jobs = new Map<string, FakeJob>();

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
      const id = opts.jobId ?? `job-${this.jobs.size + 1}`;
      if (this.jobs.has(id)) {
        throw new Error(`duplicate job id: ${id}`);
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

const { drainPendingThreadRead, enqueueThreadRead } = await import("./queue");

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
    fakes.FakeQueue.instances.at(-1)?.jobs.clear();
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
});
