import { describe, expect, it } from "vitest";

import {
  runAppendAgentRunEvents,
  runCompleteAgentRun,
  runLatestAgentRunForThread,
  runStartAgentRun,
} from "./agent-run-audit";

interface Row {
  id: string;
  [key: string]: unknown;
}

interface DbOptions {
  attemptInsertRace?: boolean;
  eventInsertRace?: boolean;
  runInsertRace?: boolean;
}

const createDb = (options: DbOptions = {}) => {
  const rows = {
    attempts: new Map<string, Row>(),
    events: new Map<string, Row>(),
    runs: new Map<string, Row>(),
  };

  const updateRow = (
    table: Map<string, Row>,
    id: string,
    values: Row
  ): void => {
    const row = table.get(id);
    if (row) {
      Object.assign(row, values);
    }
  };

  const tableFor = (name: "attempts" | "events" | "runs") => rows[name];
  const query = (name: "attempts" | "events" | "runs", filters: Row) => {
    const matches = [...tableFor(name).values()].filter((row) =>
      Object.entries(filters).every(([key, value]) => row[key] === value)
    );

    const compare = (left: unknown, right: unknown): number => {
      if (typeof left === "number" && typeof right === "number") {
        return left - right;
      }
      if (left instanceof Date && right instanceof Date) {
        return left.getTime() - right.getTime();
      }
      return String(left).localeCompare(String(right));
    };

    const makeQuery = (
      orderBys: { direction: "asc" | "desc"; field: string }[] = [],
      limitCount?: number
    ) => ({
      get: async () => {
        const ordered = [...matches].toSorted((left, right) => {
          for (const { direction, field } of orderBys) {
            const delta = compare(left[field], right[field]);
            if (delta !== 0) {
              return direction === "desc" ? -delta : delta;
            }
          }
          return 0;
        });
        return limitCount === undefined
          ? ordered
          : ordered.slice(0, limitCount);
      },
      limit: (count: number) => makeQuery(orderBys, count),
      orderBy: (field: string, direction: "asc" | "desc") =>
        makeQuery([...orderBys, { direction, field }], limitCount),
    });

    return makeQuery(matches);
  };

  const db = {
    agentRun: {
      one: (id: string) => ({ get: async () => rows.runs.get(id) ?? null }),
      update: async (id: string, values: Row) => {
        updateRow(rows.runs, id, values);
      },
      where: (filters: Row) => query("runs", filters),
    },
    agentRunAttempt: {
      one: (id: string) => ({
        get: async () => rows.attempts.get(id) ?? null,
      }),
      update: async (id: string, values: Row) => {
        updateRow(rows.attempts, id, values);
      },
      where: (filters: Row) => query("attempts", filters),
    },
    agentRunEvent: {
      one: (id: string) => ({ get: async () => rows.events.get(id) ?? null }),
      where: (filters: Row) => query("events", filters),
    },
    find: async (
      _model: unknown,
      findOptions: { where: { id: { $in: string[] } } }
    ) =>
      Object.fromEntries(
        findOptions.where.id.$in
          .map((id) => rows.events.get(id))
          .filter((row): row is Row => Boolean(row))
          .map((row) => [row.id, row])
      ),
    insert: async (_model: unknown, row: Row) => {
      if ("type" in row) {
        rows.events.set(row.id, row);
        if (options.eventInsertRace) {
          options.eventInsertRace = false;
          throw new Error("concurrent event insert");
        }
      } else if ("attemptNumber" in row) {
        rows.attempts.set(row.id, row);
        if (options.attemptInsertRace) {
          options.attemptInsertRace = false;
          throw new Error("concurrent attempt insert");
        }
      } else {
        rows.runs.set(row.id, row);
        if (options.runInsertRace) {
          options.runInsertRace = false;
          throw new Error("concurrent run insert");
        }
      }
    },
  };

  return { db, rows };
};

describe("agent run audit persistence", () => {
  it("links attempts, deduplicates immutable events, and returns the latest run", async () => {
    const { db, rows } = createDb();
    const startedAt = new Date("2026-08-18T12:00:00.000Z");

    await runStartAgentRun(db as never, {
      attemptId: "attempt-1",
      attemptNumber: 1,
      organizationId: "org-1",
      runId: "run-1",
      startedAt,
      threadId: "thread-1",
    });

    const event = {
      agentRunId: "run-1",
      attemptId: "attempt-1",
      emittedAt: startedAt,
      id: "event-1",
      occurredAt: startedAt,
      organizationId: "org-1",
      payloadHash: "hash",
      payloadStr: JSON.stringify({ decision: "reply" }),
      sequence: 0,
      threadId: "thread-1",
      type: "output.parsed",
    };

    await expect(
      runAppendAgentRunEvents(db as never, { events: [event, event] })
    ).resolves.toStrictEqual({ inserted: 1 });

    await runCompleteAgentRun(db as never, {
      attemptId: "attempt-1",
      completedAt: new Date("2026-08-18T12:00:01.000Z"),
      runId: "run-1",
      status: "completed",
    });

    const latest = await runLatestAgentRunForThread(db as never, {
      organizationId: "org-1",
      threadId: "thread-1",
    });

    expect(latest?.run.status).toBe("completed");
    expect(latest?.attempts).toHaveLength(1);
    expect(latest?.events).toHaveLength(1);
    expect(rows.events.size).toBe(1);
  });

  it("folds a concurrent event insert into one accepted event", async () => {
    const { db, rows } = createDb({ eventInsertRace: true });
    const startedAt = new Date("2026-08-18T12:00:00.000Z");

    await runStartAgentRun(db as never, {
      attemptId: "attempt-1",
      attemptNumber: 1,
      organizationId: "org-1",
      runId: "run-1",
      startedAt,
      threadId: "thread-1",
    });

    const event = {
      agentRunId: "run-1",
      attemptId: "attempt-1",
      emittedAt: startedAt,
      id: "event-1",
      occurredAt: startedAt,
      organizationId: "org-1",
      payloadHash: "hash",
      payloadStr: JSON.stringify({ decision: "reply" }),
      sequence: 0,
      threadId: "thread-1",
      type: "output.parsed",
    };

    await expect(
      runAppendAgentRunEvents(db as never, { events: [event] })
    ).resolves.toStrictEqual({ inserted: 1 });
    expect(rows.events.size).toBe(1);
  });

  it("rejects cross-scope starts and event appends", async () => {
    const { db } = createDb();
    const startedAt = new Date("2026-08-18T12:00:00.000Z");

    await runStartAgentRun(db as never, {
      attemptId: "attempt-1",
      attemptNumber: 1,
      organizationId: "org-1",
      runId: "run-1",
      startedAt,
      threadId: "thread-1",
    });

    await expect(
      runStartAgentRun(db as never, {
        attemptId: "attempt-1",
        attemptNumber: 1,
        organizationId: "org-2",
        runId: "run-1",
        startedAt,
        threadId: "thread-2",
      })
    ).rejects.toThrow("AGENT_RUN_SCOPE_MISMATCH");

    await expect(
      runAppendAgentRunEvents(db as never, {
        events: [
          {
            agentRunId: "run-1",
            attemptId: "attempt-1",
            emittedAt: startedAt,
            id: "event-1",
            occurredAt: startedAt,
            organizationId: "org-2",
            payloadHash: "hash",
            payloadStr: "{}",
            sequence: 0,
            threadId: "thread-2",
            type: "output.parsed",
          },
        ],
      })
    ).rejects.toThrow("AGENT_RUN_EVENT_SCOPE_MISMATCH");
  });

  it("handles concurrent run and attempt starts idempotently", async () => {
    const { db, rows } = createDb({
      attemptInsertRace: true,
      runInsertRace: true,
    });
    const startedAt = new Date("2026-08-18T12:00:00.000Z");

    await expect(
      runStartAgentRun(db as never, {
        attemptId: "attempt-1",
        attemptNumber: 1,
        organizationId: "org-1",
        runId: "run-1",
        startedAt,
        threadId: "thread-1",
      })
    ).resolves.toStrictEqual({ attemptId: "attempt-1", runId: "run-1" });
    expect(rows.runs.size).toBe(1);
    expect(rows.attempts.size).toBe(1);
  });

  it("orders numeric attempts and ties latest runs by id", async () => {
    const { db, rows } = createDb();
    const startedAt = new Date("2026-08-18T12:00:00.000Z");

    rows.runs.set("run-a", {
      id: "run-a",
      organizationId: "org-1",
      startedAt,
      threadId: "thread-1",
    });
    rows.runs.set("run-z", {
      id: "run-z",
      organizationId: "org-1",
      startedAt,
      threadId: "thread-1",
    });
    rows.attempts.set("attempt-10", {
      agentRunId: "run-z",
      attemptNumber: 10,
      id: "attempt-10",
      organizationId: "org-1",
      threadId: "thread-1",
    });
    rows.attempts.set("attempt-2", {
      agentRunId: "run-z",
      attemptNumber: 2,
      id: "attempt-2",
      organizationId: "org-1",
      threadId: "thread-1",
    });

    const latest = await runLatestAgentRunForThread(db as never, {
      organizationId: "org-1",
      threadId: "thread-1",
    });

    expect(latest?.run.id).toBe("run-z");
    expect(latest?.attempts.map((attempt) => attempt.id)).toStrictEqual([
      "attempt-2",
      "attempt-10",
    ]);
  });

  it("rejects completion for a missing run before updating an attempt", async () => {
    const { db, rows } = createDb();
    const startedAt = new Date("2026-08-18T12:00:00.000Z");

    await runStartAgentRun(db as never, {
      attemptId: "attempt-1",
      attemptNumber: 1,
      organizationId: "org-1",
      runId: "run-1",
      startedAt,
      threadId: "thread-1",
    });

    rows.attempts.set("attempt-other", {
      agentRunId: "run-other",
      id: "attempt-other",
      organizationId: "org-1",
      threadId: "thread-1",
    });
    await expect(
      runCompleteAgentRun(db as never, {
        attemptId: "attempt-other",
        completedAt: startedAt,
        runId: "run-1",
        status: "completed",
      })
    ).rejects.toThrow("AGENT_RUN_ATTEMPT_NOT_FOUND");

    await expect(
      runCompleteAgentRun(db as never, {
        attemptId: "attempt-1",
        completedAt: startedAt,
        runId: "run-2",
        status: "completed",
      })
    ).rejects.toThrow("AGENT_RUN_NOT_FOUND");

    rows.runs.delete("run-1");
    await expect(
      runCompleteAgentRun(db as never, {
        attemptId: "attempt-1",
        completedAt: startedAt,
        runId: "run-1",
        status: "completed",
      })
    ).rejects.toThrow("AGENT_RUN_NOT_FOUND");
  });
});
