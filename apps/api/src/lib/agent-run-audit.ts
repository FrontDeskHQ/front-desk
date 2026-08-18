import type { ServerDB } from "@live-state/sync/server";
import { z } from "zod";

import { schema } from "../live-state/schema";

const jsonStringSchema = z.string().refine(
  (value) => {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: "value must be valid JSON" }
);

export const startAgentRunInputSchema = z
  .object({
    attemptId: z.string().min(1),
    attemptNumber: z.number().int().min(1),
    bullmqJobId: z.string().nullable().optional(),
    createdAt: z.coerce.date().optional(),
    metadataStr: jsonStringSchema.nullable().optional(),
    organizationId: z.string().min(1),
    pipelineJobId: z.string().nullable().optional(),
    queueName: z.string().nullable().optional(),
    runId: z.string().min(1),
    startedAt: z.coerce.date(),
    threadId: z.string().min(1),
  })
  .strict();

export const appendAgentRunEventsInputSchema = z
  .object({
    events: z
      .array(
        z
          .object({
            agentRunId: z.string().min(1),
            attemptId: z.string().min(1),
            causationEventId: z.string().nullable().optional(),
            emittedAt: z.coerce.date(),
            id: z.string().min(1),
            occurredAt: z.coerce.date(),
            organizationId: z.string().min(1),
            payloadHash: z.string().nullable().optional(),
            payloadStr: jsonStringSchema.nullable().optional(),
            phase: z.string().nullable().optional(),
            processor: z.string().nullable().optional(),
            sequence: z.number().int().min(0),
            stepIndex: z.number().int().min(0).nullable().optional(),
            threadId: z.string().min(1),
            toolCallId: z.string().nullable().optional(),
            type: z.string().min(1),
          })
          .strict()
      )
      .max(500),
  })
  .strict();

export const completeAgentRunInputSchema = z
  .object({
    attemptId: z.string().min(1),
    completedAt: z.coerce.date(),
    metadataStr: jsonStringSchema.nullable().optional(),
    runId: z.string().min(1),
    status: z.enum(["completed", "failed", "abandoned"]),
    auditIncomplete: z.boolean().optional(),
  })
  .strict();

export const latestAgentRunInputSchema = z
  .object({
    organizationId: z.string().min(1),
    threadId: z.string().min(1),
  })
  .strict();

type AgentRunDb = Pick<
  ServerDB<typeof schema>,
  | "agentRun"
  | "agentRunAttempt"
  | "agentRunEvent"
  | "find"
  | "insert"
  | "update"
>;

type StartAgentRunInput = z.infer<typeof startAgentRunInputSchema>;
type AppendAgentRunEventsInput = z.infer<
  typeof appendAgentRunEventsInputSchema
>;
type CompleteAgentRunInput = z.infer<typeof completeAgentRunInputSchema>;
type LatestAgentRunInput = z.infer<typeof latestAgentRunInputSchema>;

const assertRunScope = (
  run: { organizationId: string; threadId: string },
  input: { organizationId: string; threadId: string }
): void => {
  if (
    run.organizationId !== input.organizationId ||
    run.threadId !== input.threadId
  ) {
    throw new Error("AGENT_RUN_SCOPE_MISMATCH");
  }
};

const assertAttemptScope = (
  attempt: {
    agentRunId: string;
    organizationId: string;
    threadId: string;
  },
  input: {
    agentRunId: string;
    organizationId: string;
    threadId: string;
  }
): void => {
  if (
    attempt.agentRunId !== input.agentRunId ||
    attempt.organizationId !== input.organizationId ||
    attempt.threadId !== input.threadId
  ) {
    throw new Error("AGENT_RUN_ATTEMPT_SCOPE_MISMATCH");
  }
};

const isUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { cause?: unknown; code?: unknown };
  return (
    candidate.code === "23505" ||
    (candidate.cause !== undefined &&
      candidate.cause !== error &&
      isUniqueViolation(candidate.cause))
  );
};

const assertEventScope = (
  run:
    | {
        id: string;
        organizationId: string;
        threadId: string;
      }
    | null
    | undefined,
  attempt:
    | {
        agentRunId: string;
        id: string;
        organizationId: string;
        threadId: string;
      }
    | null
    | undefined,
  event: AppendAgentRunEventsInput["events"][number]
): void => {
  if (
    !run ||
    run.id !== event.agentRunId ||
    run.organizationId !== event.organizationId ||
    run.threadId !== event.threadId
  ) {
    throw new Error("AGENT_RUN_EVENT_SCOPE_MISMATCH");
  }

  if (
    !attempt ||
    attempt.id !== event.attemptId ||
    attempt.agentRunId !== event.agentRunId ||
    attempt.organizationId !== event.organizationId ||
    attempt.threadId !== event.threadId
  ) {
    throw new Error("AGENT_RUN_EVENT_SCOPE_MISMATCH");
  }
};

/** The tenant and run an event row belongs to — all a duplicate must match. */
interface EventScope {
  agentRunId: string;
  attemptId: string;
  organizationId: string;
  threadId: string;
}

const assertStoredEventScope = (
  stored: EventScope,
  event: AppendAgentRunEventsInput["events"][number]
): void => {
  if (
    stored.agentRunId !== event.agentRunId ||
    stored.attemptId !== event.attemptId ||
    stored.organizationId !== event.organizationId ||
    stored.threadId !== event.threadId
  ) {
    throw new Error("AGENT_RUN_EVENT_SCOPE_MISMATCH");
  }
};

export const runStartAgentRun = async (
  db: AgentRunDb,
  input: StartAgentRunInput
) => {
  const timestamp = input.createdAt ?? new Date();
  const shared = {
    completedAt: null,
    startedAt: input.startedAt,
    status: "running",
    updatedAt: timestamp,
  };
  const attemptScope = {
    agentRunId: input.runId,
    organizationId: input.organizationId,
    threadId: input.threadId,
  };

  await upsertStartedRow({
    assertScope: (row) => assertRunScope(row, input),
    insert: () =>
      db.insert(schema.agentRun, {
        ...shared,
        auditIncomplete: false,
        bullmqJobId: input.bullmqJobId ?? null,
        createdAt: timestamp,
        id: input.runId,
        metadataStr: input.metadataStr ?? null,
        organizationId: input.organizationId,
        pipelineJobId: input.pipelineJobId ?? null,
        queueName: input.queueName ?? null,
        threadId: input.threadId,
      }),
    insertFailedError: "AGENT_RUN_INSERT_FAILED",
    read: () => db.agentRun.one(input.runId).get(),
    update: (row) =>
      db.agentRun.update(row.id, {
        ...shared,
        bullmqJobId: input.bullmqJobId ?? row.bullmqJobId,
        metadataStr: input.metadataStr ?? row.metadataStr,
        pipelineJobId: input.pipelineJobId ?? row.pipelineJobId,
        queueName: input.queueName ?? row.queueName,
      }),
  });

  await upsertStartedRow({
    assertScope: (row) => assertAttemptScope(row, attemptScope),
    insert: () =>
      db.insert(schema.agentRunAttempt, {
        ...shared,
        ...attemptScope,
        attemptNumber: input.attemptNumber,
        auditIncomplete: false,
        bullmqJobId: input.bullmqJobId ?? null,
        createdAt: timestamp,
        id: input.attemptId,
        metadataStr: input.metadataStr ?? null,
        pipelineJobId: input.pipelineJobId ?? null,
        queueName: input.queueName ?? null,
      }),
    insertFailedError: "AGENT_RUN_ATTEMPT_INSERT_FAILED",
    read: () => db.agentRunAttempt.one(input.attemptId).get(),
    update: (row) =>
      db.agentRunAttempt.update(row.id, {
        ...shared,
        bullmqJobId: input.bullmqJobId ?? row.bullmqJobId,
        metadataStr: input.metadataStr ?? row.metadataStr,
        pipelineJobId: input.pipelineJobId ?? row.pipelineJobId,
        queueName: input.queueName ?? row.queueName,
      }),
  });

  return { attemptId: input.attemptId, runId: input.runId };
};

/**
 * Insert the row, or reset the one already there back to "running" — restarting
 * a run or attempt is idempotent. The unique-violation retry covers a
 * concurrent start inserting the same id between the read and the insert.
 */
const upsertStartedRow = async <T extends { id: string }>({
  assertScope,
  insert,
  insertFailedError,
  read,
  update,
}: {
  assertScope: (row: T) => void;
  insert: () => Promise<unknown>;
  insertFailedError: string;
  read: () => Promise<T | null | undefined>;
  update: (row: T) => Promise<unknown>;
}): Promise<void> => {
  const existing = await read();
  if (existing) {
    assertScope(existing);
    await update(existing);
    return;
  }

  try {
    await insert();
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    const concurrent = await read();
    if (!concurrent) {
      throw new Error(insertFailedError, { cause: error });
    }
    assertScope(concurrent);
    await update(concurrent);
  }
};

export const runAppendAgentRunEvents = async (
  db: AgentRunDb,
  input: AppendAgentRunEventsInput
) => {
  const firstEvent = input.events[0];
  if (!firstEvent) {
    return { inserted: 0 };
  }

  const [run, attempt] = await Promise.all([
    db.agentRun.one(firstEvent.agentRunId).get(),
    db.agentRunAttempt.one(firstEvent.attemptId).get(),
  ]);
  const stored = new Map<string, EventScope>(
    Object.values(
      await db.find(schema.agentRunEvent, {
        where: { id: { $in: [...new Set(input.events.map((e) => e.id))] } },
      })
    ).map((event) => [event.id, event])
  );
  let inserted = 0;

  for (const event of input.events) {
    assertEventScope(run, attempt, event);

    const already = stored.get(event.id);
    if (already) {
      assertStoredEventScope(already, event);
      continue;
    }

    try {
      await db.insert(schema.agentRunEvent, {
        agentRunId: event.agentRunId,
        attemptId: event.attemptId,
        causationEventId: event.causationEventId ?? null,
        emittedAt: event.emittedAt,
        id: event.id,
        occurredAt: event.occurredAt,
        organizationId: event.organizationId,
        payloadHash: event.payloadHash ?? null,
        payloadStr: event.payloadStr ?? null,
        phase: event.phase ?? null,
        processor: event.processor ?? null,
        sequence: event.sequence,
        stepIndex: event.stepIndex ?? null,
        threadId: event.threadId,
        toolCallId: event.toolCallId ?? null,
        type: event.type,
      });
      stored.set(event.id, event);
      inserted += 1;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      // A concurrent flush may have inserted the same immutable event. Verify
      // that case rather than making a harmless duplicate race fail the run.
      const concurrent = await db.agentRunEvent.one(event.id).get();
      if (!concurrent) {
        throw new Error("AGENT_RUN_EVENT_INSERT_FAILED", { cause: error });
      }
      assertStoredEventScope(concurrent, event);
      stored.set(event.id, concurrent);
      inserted += 1;
    }
  }

  return { inserted };
};

export const runCompleteAgentRun = async (
  db: AgentRunDb,
  input: CompleteAgentRunInput
) => {
  const run = await db.agentRun.one(input.runId).get();
  if (!run) {
    throw new Error("AGENT_RUN_NOT_FOUND");
  }

  const attempt = await db.agentRunAttempt.one(input.attemptId).get();
  if (!attempt || attempt.agentRunId !== input.runId) {
    throw new Error("AGENT_RUN_ATTEMPT_NOT_FOUND");
  }

  const timestamp = new Date();
  await db.agentRunAttempt.update(attempt.id, {
    auditIncomplete: input.auditIncomplete ?? attempt.auditIncomplete,
    completedAt: input.completedAt,
    metadataStr: input.metadataStr ?? attempt.metadataStr,
    status: input.status,
    updatedAt: timestamp,
  });

  await db.agentRun.update(run.id, {
    auditIncomplete: run.auditIncomplete || (input.auditIncomplete ?? false),
    completedAt: input.completedAt,
    metadataStr: input.metadataStr ?? run.metadataStr,
    status: input.status,
    updatedAt: timestamp,
  });

  return { attemptId: input.attemptId, runId: input.runId };
};

const sortByTimeAndSequence = <
  T extends { occurredAt: Date; sequence: number },
>(
  rows: T[]
): T[] =>
  rows.toSorted((a, b) => {
    const time = a.occurredAt.getTime() - b.occurredAt.getTime();
    return time !== 0 ? time : a.sequence - b.sequence;
  });

export const runLatestAgentRunForThread = async (
  db: AgentRunDb,
  input: LatestAgentRunInput
) => {
  const runs = await db.agentRun
    .where({
      organizationId: input.organizationId,
      threadId: input.threadId,
    })
    .orderBy("startedAt", "desc")
    .orderBy("id", "desc")
    .limit(1)
    .get();
  const run = runs[0];
  if (!run) {
    return null;
  }

  const attempts = await db.agentRunAttempt
    .where({
      agentRunId: run.id,
      organizationId: input.organizationId,
      threadId: input.threadId,
    })
    .orderBy("attemptNumber", "asc")
    .get();
  const events = sortByTimeAndSequence(
    await db.agentRunEvent
      .where({
        agentRunId: run.id,
        organizationId: input.organizationId,
        threadId: input.threadId,
      })
      .get()
  );

  return { attempts, events, run };
};
