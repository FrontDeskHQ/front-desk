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

const createDb = () => {
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

    const makeQuery = (result: Row[]) => ({
      get: async () => result,
      limit: (count: number) => makeQuery(result.slice(0, count)),
      orderBy: (field: string, direction: "asc" | "desc") =>
        makeQuery(
          [...result].toSorted((left, right) => {
            const delta = String(left[field]).localeCompare(
              String(right[field])
            );
            return direction === "desc" ? -delta : delta;
          })
        ),
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
      options: { where: { id: { $in: string[] } } }
    ) =>
      Object.fromEntries(
        options.where.id.$in
          .map((id) => rows.events.get(id))
          .filter((row): row is Row => Boolean(row))
          .map((row) => [row.id, row])
      ),
    insert: async (_model: unknown, row: Row) => {
      if ("type" in row) {
        rows.events.set(row.id, row);
      } else if ("attemptNumber" in row) {
        rows.attempts.set(row.id, row);
      } else {
        rows.runs.set(row.id, row);
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
});
