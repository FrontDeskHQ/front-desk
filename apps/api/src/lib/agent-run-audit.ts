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
    queueJobId: z.string().nullable().optional(),
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

const now = () => new Date();

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

const assertEventScope = async (
  db: AgentRunDb,
  event: AppendAgentRunEventsInput["events"][number]
): Promise<void> => {
  const run = await db.agentRun.one(event.agentRunId).get();
  if (
    !run ||
    run.organizationId !== event.organizationId ||
    run.threadId !== event.threadId
  ) {
    throw new Error("AGENT_RUN_EVENT_SCOPE_MISMATCH");
  }

  const attempt = await db.agentRunAttempt.one(event.attemptId).get();
  if (
    !attempt ||
    attempt.agentRunId !== event.agentRunId ||
    attempt.organizationId !== event.organizationId ||
    attempt.threadId !== event.threadId
  ) {
    throw new Error("AGENT_RUN_EVENT_SCOPE_MISMATCH");
  }
};

const assertStoredEventScope = (
  stored: {
    agentRunId: string;
    attemptId: string;
    organizationId: string;
    threadId: string;
  },
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
  const timestamp = input.createdAt ?? now();
  const run = await db.agentRun.one(input.runId).get();

  if (run) {
    assertRunScope(run, input);
    const values = {
      auditIncomplete: run.auditIncomplete,
      completedAt: null,
      metadataStr: input.metadataStr ?? run.metadataStr,
      pipelineJobId: input.pipelineJobId ?? run.pipelineJobId,
      queueJobId: input.queueJobId ?? run.queueJobId,
      queueName: input.queueName ?? run.queueName,
      startedAt: input.startedAt,
      status: "running",
      updatedAt: timestamp,
    };
    await db.agentRun.update(run.id, values);
  } else {
    try {
      await db.insert(schema.agentRun, {
        auditIncomplete: false,
        completedAt: null,
        createdAt: timestamp,
        id: input.runId,
        metadataStr: input.metadataStr ?? null,
        organizationId: input.organizationId,
        pipelineJobId: input.pipelineJobId ?? null,
        queueJobId: input.queueJobId ?? null,
        queueName: input.queueName ?? null,
        startedAt: input.startedAt,
        status: "running",
        threadId: input.threadId,
        updatedAt: timestamp,
      });
    } catch {
      const concurrent = await db.agentRun.one(input.runId).get();
      if (!concurrent) {
        throw new Error("AGENT_RUN_INSERT_FAILED");
      }
      assertRunScope(concurrent, input);
      await db.agentRun.update(concurrent.id, {
        auditIncomplete: concurrent.auditIncomplete,
        completedAt: null,
        metadataStr: input.metadataStr ?? concurrent.metadataStr,
        pipelineJobId: input.pipelineJobId ?? concurrent.pipelineJobId,
        queueJobId: input.queueJobId ?? concurrent.queueJobId,
        queueName: input.queueName ?? concurrent.queueName,
        startedAt: input.startedAt,
        status: "running",
        updatedAt: timestamp,
      });
    }
  }

  const attempt = await db.agentRunAttempt.one(input.attemptId).get();
  if (attempt) {
    assertAttemptScope(attempt, {
      agentRunId: input.runId,
      organizationId: input.organizationId,
      threadId: input.threadId,
    });
    const values = {
      auditIncomplete: attempt.auditIncomplete,
      bullmqJobId: input.bullmqJobId ?? attempt.bullmqJobId,
      completedAt: null,
      metadataStr: input.metadataStr ?? attempt.metadataStr,
      pipelineJobId: input.pipelineJobId ?? attempt.pipelineJobId,
      queueName: input.queueName ?? attempt.queueName,
      startedAt: input.startedAt,
      status: "running",
      updatedAt: timestamp,
    };
    await db.agentRunAttempt.update(attempt.id, values);
  } else {
    try {
      await db.insert(schema.agentRunAttempt, {
        agentRunId: input.runId,
        auditIncomplete: false,
        attemptNumber: input.attemptNumber,
        bullmqJobId: input.bullmqJobId ?? null,
        completedAt: null,
        createdAt: timestamp,
        id: input.attemptId,
        metadataStr: input.metadataStr ?? null,
        organizationId: input.organizationId,
        pipelineJobId: input.pipelineJobId ?? null,
        queueName: input.queueName ?? null,
        startedAt: input.startedAt,
        status: "running",
        threadId: input.threadId,
        updatedAt: timestamp,
      });
    } catch {
      const concurrent = await db.agentRunAttempt.one(input.attemptId).get();
      if (!concurrent) {
        throw new Error("AGENT_RUN_ATTEMPT_INSERT_FAILED");
      }
      assertAttemptScope(concurrent, {
        agentRunId: input.runId,
        organizationId: input.organizationId,
        threadId: input.threadId,
      });
      await db.agentRunAttempt.update(concurrent.id, {
        auditIncomplete: concurrent.auditIncomplete,
        bullmqJobId: input.bullmqJobId ?? concurrent.bullmqJobId,
        completedAt: null,
        metadataStr: input.metadataStr ?? concurrent.metadataStr,
        pipelineJobId: input.pipelineJobId ?? concurrent.pipelineJobId,
        queueName: input.queueName ?? concurrent.queueName,
        startedAt: input.startedAt,
        status: "running",
        updatedAt: timestamp,
      });
    }
  }

  return { attemptId: input.attemptId, runId: input.runId };
};

export const runAppendAgentRunEvents = async (
  db: AgentRunDb,
  input: AppendAgentRunEventsInput
) => {
  if (input.events.length === 0) {
    return { inserted: 0 };
  }

  const eventIds = [...new Set(input.events.map((event) => event.id))];
  const existing = Object.values(
    await db.find(schema.agentRunEvent, {
      where: { id: { $in: eventIds } },
    })
  );
  const existingIds = new Set(existing.map((event) => event.id));
  let inserted = 0;

  for (const event of input.events) {
    await assertEventScope(db, event);

    if (existingIds.has(event.id)) {
      const stored = await db.agentRunEvent.one(event.id).get();
      if (stored) {
        assertStoredEventScope(stored, event);
      }
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
      existingIds.add(event.id);
      inserted += 1;
    } catch {
      // A concurrent flush may have inserted the same immutable event. Verify
      // that case rather than making a harmless duplicate race fail the run.
      const concurrent = await db.agentRunEvent.one(event.id).get();
      if (!concurrent) {
        throw new Error("AGENT_RUN_EVENT_INSERT_FAILED");
      }
      assertStoredEventScope(concurrent, event);
      existingIds.add(event.id);
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

  const timestamp = now();
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
