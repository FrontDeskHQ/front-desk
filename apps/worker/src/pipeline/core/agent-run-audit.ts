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
  queueGeneration?: number;
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
  queueGeneration,
  queueJobId,
  queueName,
  threadId,
}: {
  pipelineJobId?: string;
  queueGeneration?: number;
  queueJobId?: string;
  queueName?: string;
  threadId: string;
}): string =>
  stableId(
    [
      queueName ?? "pipeline",
      queueGeneration === undefined
        ? (queueJobId ?? pipelineJobId ?? ulid())
        : `generation:${queueGeneration}`,
      threadId,
    ].join(":")
  );

export const agentRunAttemptIdFor = (
  runId: string,
  attemptNumber: number
): string => stableId(`${runId}:attempt:${attemptNumber}`);

const serializeForAudit = (value: unknown): string => {
  try {
    const stack: unknown[] = [];
    const serialized = JSON.stringify(
      value,
      function serializeReplacer(this: unknown, _key, currentValue: unknown) {
        while (stack.length > 0 && stack.at(-1) !== this) {
          stack.pop();
        }

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
          if (stack.includes(currentValue)) {
            return "[Circular]";
          }
          stack.push(currentValue);
        }

        return currentValue;
      }
    );

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
  queueGeneration: start.queueGeneration ?? null,
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
  #startPromise: Promise<boolean> | null = null;
  #startSettled = false;
  #completionPromise: Promise<void> | null = null;

  constructor(start: AgentRunAuditStart, runId: string, attemptId: string) {
    this.#start = start;
    this.runId = runId;
    this.attemptId = attemptId;
  }

  async start(): Promise<void> {
    const startRequest = Promise.resolve().then(() =>
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
      })
    );
    this.#startPromise = startRequest
      .then(() => {
        this.#started = true;
        this.recordIncompleteEvent("start_timeout");
        return true;
      })
      .catch((error) => {
        this.markIncomplete("start_failed");
        auditLog("start_failed", {
          attemptId: this.attemptId,
          error: errorFields(error),
          runId: this.runId,
          threadId: this.#start.threadId,
        });
        return false;
      })
      .finally(() => {
        this.#startSettled = true;
      });

    const result = await withTimeout(this.#startPromise, FLUSH_TIMEOUT_MS);
    if (result === undefined) {
      this.markIncomplete("start_timeout");
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
    if (this.#completionPromise) {
      return this.#completionPromise;
    }

    this.#completionPromise = this.completeOnce(status, payload);
    return this.#completionPromise;
  }

  private async completeOnce(
    status: "completed" | "failed" | "abandoned",
    payload?: unknown
  ): Promise<void> {
    this.record(
      status === "completed" ? "run.completed" : "run.failed",
      payload ?? { status },
      { phase: "run" }
    );

    const started = this.#started
      ? true
      : await withTimeout(
          this.#startPromise ?? Promise.resolve(false),
          FLUSH_TIMEOUT_MS
        );

    if (started === undefined) {
      this.markIncomplete("complete_waiting_for_start");
      if (this.#startPromise && !this.#startSettled) {
        void this.#startPromise
          .then((didStart) => {
            if (!didStart) {
              this.markIncomplete("run_never_started");
              return;
            }
            return this.finishCompletion(status, payload);
          })
          .catch((error) => {
            this.markIncomplete("complete_after_start_failed");
            auditLog("complete_after_start_failed", {
              attemptId: this.attemptId,
              error: errorFields(error),
              runId: this.runId,
              threadId: this.#start.threadId,
            });
          });
      }
      return;
    }

    if (!started) {
      this.markIncomplete("run_never_started");
      return;
    }

    await this.finishCompletion(status, payload);
  }

  private async finishCompletion(
    status: "completed" | "failed" | "abandoned",
    payload?: unknown
  ): Promise<void> {
    // `flushLoop` applies the transport timeout per batch and marks the audit
    // incomplete on timeout. Do not wrap this void-returning promise in
    // another timeout: `undefined` is also the successful result of `flush()`.
    await this.flush();

    if (!this.#started) {
      this.markIncomplete("run_never_started");
      return;
    }

    const auditIncomplete = this.#incomplete || this.#pending.length > 0;
    const metadataStr = JSON.stringify({
      ...(payload && typeof payload === "object" ? payload : {}),
      auditIncomplete,
    });
    const completionRequest = Promise.resolve().then(() =>
      fetchClient.mutate.agentRun.complete({
        attemptId: this.attemptId,
        auditIncomplete,
        completedAt: new Date(),
        metadataStr,
        runId: this.runId,
        status,
      })
    );

    try {
      const result = await withTimeout(completionRequest, FLUSH_TIMEOUT_MS);
      if (result === undefined) {
        this.markIncomplete("complete_timeout");
        void completionRequest
          .catch((error) => {
            auditLog("complete_failed_after_timeout", {
              attemptId: this.attemptId,
              error: errorFields(error),
              runId: this.runId,
              threadId: this.#start.threadId,
            });
          })
          .then(() => this.reconcileCompletion(status, payload));
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

  private async reconcileCompletion(
    status: "completed" | "failed" | "abandoned",
    payload?: unknown
  ): Promise<void> {
    await this.flush();
    const metadataStr = JSON.stringify({
      ...(payload && typeof payload === "object" ? payload : {}),
      auditIncomplete: true,
    });
    try {
      await fetchClient.mutate.agentRun.complete({
        attemptId: this.attemptId,
        auditIncomplete: true,
        completedAt: new Date(),
        metadataStr,
        runId: this.runId,
        status,
      });
    } catch (error) {
      auditLog("complete_reconcile_failed", {
        attemptId: this.attemptId,
        error: errorFields(error),
        runId: this.runId,
        threadId: this.#start.threadId,
      });
    }
  }

  private recordIncompleteEvent(reason: string): void {
    if (this.#started && this.#incomplete && !this.#incompleteEventRecorded) {
      this.#incompleteEventRecorded = true;
      this.record("audit.incomplete", { reason }, { phase: "audit" });
    }
  }

  private markIncomplete(reason: string): void {
    const firstIncomplete = !this.#incomplete;
    this.#incomplete = true;
    this.recordIncompleteEvent(reason);
    if (!firstIncomplete) {
      return;
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
    queueGeneration: start.queueGeneration,
    queueJobId: start.queueJobId,
    queueName: start.queueName,
    threadId: start.threadId,
  });
  const attemptId = agentRunAttemptIdFor(runId, start.attemptNumber);
  const audit = new AgentRunAuditImpl(start, runId, attemptId);
  await audit.start();
  return audit;
};
