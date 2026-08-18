import { createHash } from "node:crypto";

import { log } from "@workspace/utils/logging";
import { ulid } from "ulid";

import { fetchClient } from "../../lib/database/client";
import { errorFields } from "../../lib/logging";
import type { PipelineJobInput, PipelineJobOptions } from "./types";

export const AGENT_RUN_EVENT_TYPES = [
  "run.started",
  "run.completed",
  "run.failed",
  "trigger.received",
  "pipeline.plan",
  "processor.started",
  "processor.completed",
  "processor.skipped",
  "processor.failed",
  "hint.computed",
  "context.captured",
  "model.requested",
  "model.step",
  "model.completed",
  "model.failed",
  "tool.called",
  "tool.completed",
  "output.parsed",
  "autonomy.policy",
  "action.filtered",
  "gate.evaluated",
  "action.executed",
  "action.failed",
  "action.suggested",
  "read.published",
  "audit.incomplete",
] as const;

export type AgentRunEventType = (typeof AGENT_RUN_EVENT_TYPES)[number];

export interface AgentRunEventMetadata {
  causationEventId?: string;
  phase?: string;
  processor?: string;
  stepIndex?: number;
  toolCallId?: string;
}

export interface AgentRunAuditStart {
  attemptNumber: number;
  bullmqJobId?: string;
  organizationId: string;
  pipelineJobId?: string;
  queueJobId?: string;
  queueName?: string;
  threadId: string;
  input: PipelineJobInput;
  options: PipelineJobOptions;
  rawQueuePayload?: unknown;
}

export interface AgentRunAudit {
  readonly attemptId: string;
  readonly runId: string;
  record: (
    type: AgentRunEventType,
    payload: unknown,
    metadata?: AgentRunEventMetadata
  ) => void;
  flush: () => Promise<void>;
  complete: (
    status: "completed" | "failed" | "abandoned",
    payload?: unknown
  ) => Promise<void>;
}

const FLUSH_TIMEOUT_MS = 500;
const FLUSH_BATCH_SIZE = 100;

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T | undefined> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timeout = setTimeout(() => resolve(undefined), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const stableId = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 32);

export const agentRunIdFor = ({
  pipelineJobId,
  queueJobId,
  queueName,
  threadId,
}: {
  pipelineJobId?: string;
  queueJobId?: string;
  queueName?: string;
  threadId: string;
}): string =>
  stableId(
    [
      queueName ?? "pipeline",
      queueJobId ?? pipelineJobId ?? ulid(),
      threadId,
    ].join(":")
  );

export const agentRunAttemptIdFor = (
  runId: string,
  attemptNumber: number
): string => stableId(`${runId}:attempt:${attemptNumber}`);

const serializeForAudit = (value: unknown): string => {
  try {
    const seen = new WeakSet<object>();
    const serialized = JSON.stringify(value, (_key, currentValue: unknown) => {
      if (typeof currentValue === "bigint") {
        return `${currentValue.toString()}n`;
      }

      if (currentValue instanceof Error) {
        return {
          message: currentValue.message,
          name: currentValue.name,
          stack: currentValue.stack,
        };
      }

      if (typeof currentValue === "object" && currentValue !== null) {
        if (seen.has(currentValue)) {
          return "[Circular]";
        }
        seen.add(currentValue);
      }

      return currentValue;
    });

    return serialized === undefined ? "null" : serialized;
  } catch (error) {
    return JSON.stringify({
      serializationError:
        error instanceof Error ? error.message : String(error),
      value: "[Unserializable]",
    });
  }
};

const payloadHash = (payloadStr: string): string =>
  createHash("sha256").update(payloadStr).digest("hex");

const auditLog = (event: string, fields: Record<string, unknown>) => {
  // Keep audit transport failures on the operational logging path. This is
  // deliberately not the same as the forensic ledger: the pipeline must not
  // depend on the latter being reachable.
  log.warn({
    action: "worker.agent_run_audit",
    event,
    ...fields,
  });
};

const startMetadata = (start: AgentRunAuditStart) => ({
  captureMode: "full",
  options: start.options,
  queuePayload: start.rawQueuePayload ?? null,
  triggers: start.input.audit?.normalizedTriggers ?? start.input.triggers ?? [],
});

class AgentRunAuditImpl implements AgentRunAudit {
  readonly attemptId: string;
  readonly runId: string;

  #nextSequence = 0;
  #pending: {
    agentRunId: string;
    attemptId: string;
    causationEventId: string | null;
    emittedAt: Date;
    id: string;
    occurredAt: Date;
    organizationId: string;
    payloadHash: string;
    payloadStr: string;
    phase: string | null;
    processor: string | null;
    sequence: number;
    stepIndex: number | null;
    threadId: string;
    toolCallId: string | null;
    type: string;
  }[] = [];
  #flushPromise: Promise<void> | null = null;
  #flushScheduled = false;
  #incomplete = false;
  #incompleteEventRecorded = false;
  #started = false;
  #start: AgentRunAuditStart;

  constructor(start: AgentRunAuditStart, runId: string, attemptId: string) {
    this.#start = start;
    this.runId = runId;
    this.attemptId = attemptId;
  }

  async start(): Promise<void> {
    try {
      const result = await withTimeout(
        fetchClient.mutate.agentRun.start({
          attemptId: this.attemptId,
          attemptNumber: this.#start.attemptNumber,
          bullmqJobId: this.#start.bullmqJobId ?? null,
          createdAt: new Date(),
          metadataStr: JSON.stringify(startMetadata(this.#start)),
          organizationId: this.#start.organizationId,
          pipelineJobId: this.#start.pipelineJobId ?? null,
          queueJobId: this.#start.queueJobId ?? null,
          queueName: this.#start.queueName ?? null,
          runId: this.runId,
          startedAt: new Date(),
          threadId: this.#start.threadId,
        }),
        FLUSH_TIMEOUT_MS
      );

      if (!result) {
        this.markIncomplete("start_timeout");
        return;
      }

      this.#started = true;
    } catch (error) {
      this.markIncomplete("start_failed");
      auditLog("start_failed", {
        attemptId: this.attemptId,
        error: errorFields(error),
        runId: this.runId,
        threadId: this.#start.threadId,
      });
    }
  }

  record(
    type: AgentRunEventType,
    payload: unknown,
    metadata: AgentRunEventMetadata = {}
  ): void {
    const payloadStr = serializeForAudit(payload);
    const sequence = this.#nextSequence++;
    const occurredAt = new Date();

    this.#pending.push({
      agentRunId: this.runId,
      attemptId: this.attemptId,
      causationEventId: metadata.causationEventId ?? null,
      emittedAt: new Date(),
      id: stableId(`${this.attemptId}:event:${sequence}`),
      occurredAt,
      organizationId: this.#start.organizationId,
      payloadHash: payloadHash(payloadStr),
      payloadStr,
      phase: metadata.phase ?? null,
      processor: metadata.processor ?? null,
      sequence,
      stepIndex: metadata.stepIndex ?? null,
      threadId: this.#start.threadId,
      toolCallId: metadata.toolCallId ?? null,
      type,
    });

    this.scheduleFlush();
  }

  async flush(): Promise<void> {
    if (this.#flushPromise) {
      return this.#flushPromise;
    }

    this.#flushPromise = this.flushLoop().finally(() => {
      this.#flushPromise = null;
    });
    return this.#flushPromise;
  }

  async complete(
    status: "completed" | "failed" | "abandoned",
    payload?: unknown
  ): Promise<void> {
    this.record(
      status === "completed" ? "run.completed" : "run.failed",
      payload ?? { status },
      { phase: "run" }
    );

    // `flushLoop` applies the transport timeout per batch and marks the audit
    // incomplete on timeout. Do not wrap this void-returning promise in
    // another timeout: `undefined` is also the successful result of `flush()`.
    await this.flush();

    try {
      if (!this.#started) {
        this.markIncomplete("run_never_started");
        return;
      }

      const result = await withTimeout(
        fetchClient.mutate.agentRun.complete({
          attemptId: this.attemptId,
          auditIncomplete: this.#incomplete || this.#pending.length > 0,
          completedAt: new Date(),
          metadataStr: JSON.stringify({
            ...(payload && typeof payload === "object" ? payload : {}),
            auditIncomplete: this.#incomplete || this.#pending.length > 0,
          }),
          runId: this.runId,
          status,
        }),
        FLUSH_TIMEOUT_MS
      );

      if (!result) {
        this.markIncomplete("complete_timeout");
      }
    } catch (error) {
      this.markIncomplete("complete_failed");
      auditLog("complete_failed", {
        attemptId: this.attemptId,
        error: errorFields(error),
        runId: this.runId,
        threadId: this.#start.threadId,
      });
    }
  }

  private markIncomplete(reason: string): void {
    if (this.#incomplete) {
      return;
    }
    this.#incomplete = true;
    if (this.#started && !this.#incompleteEventRecorded) {
      this.#incompleteEventRecorded = true;
      this.record("audit.incomplete", { reason }, { phase: "audit" });
    }
    auditLog("incomplete", {
      attemptId: this.attemptId,
      reason,
      runId: this.runId,
      threadId: this.#start.threadId,
    });
  }

  private scheduleFlush(): void {
    if (this.#flushScheduled) {
      return;
    }

    this.#flushScheduled = true;
    setTimeout(() => {
      this.#flushScheduled = false;
      void this.flush();
    }, 0);
  }

  private async flushLoop(): Promise<void> {
    if (!this.#started || this.#pending.length === 0) {
      return;
    }

    while (this.#pending.length > 0) {
      const batch = this.#pending.splice(0, FLUSH_BATCH_SIZE);
      try {
        const result = await withTimeout(
          fetchClient.mutate.agentRun.appendEvents({ events: batch }),
          FLUSH_TIMEOUT_MS
        );
        if (!result) {
          this.#pending.unshift(...batch);
          this.markIncomplete("append_timeout");
          auditLog("append_timeout", {
            attemptId: this.attemptId,
            batchSize: batch.length,
            runId: this.runId,
            threadId: this.#start.threadId,
          });
          return;
        }
      } catch (error) {
        this.#pending.unshift(...batch);
        this.markIncomplete("append_failed");
        auditLog("append_failed", {
          attemptId: this.attemptId,
          batchSize: batch.length,
          error: errorFields(error),
          runId: this.runId,
          threadId: this.#start.threadId,
        });
        return;
      }
    }
  }
}

export const createAgentRunAudit = async (
  start: AgentRunAuditStart
): Promise<AgentRunAudit> => {
  const runId = agentRunIdFor({
    pipelineJobId: start.pipelineJobId,
    queueJobId: start.queueJobId,
    queueName: start.queueName,
    threadId: start.threadId,
  });
  const attemptId = agentRunAttemptIdFor(runId, start.attemptNumber);
  const audit = new AgentRunAuditImpl(start, runId, attemptId);
  await audit.start();
  return audit;
};
