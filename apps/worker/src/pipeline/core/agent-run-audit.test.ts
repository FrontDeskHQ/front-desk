import { log } from "@workspace/utils/logging";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface AuditResponse {
  attemptId: string;
  runId: string;
}

interface AppendInput {
  events: {
    payloadHash: string;
    payloadStr: string;
    sequence: number;
  }[];
}

const auditMocks = vi.hoisted(() => ({
  appendEvents: vi.fn<(input: AppendInput) => Promise<{ inserted: number }>>(),
  complete: vi.fn<(input: unknown) => Promise<AuditResponse>>(),
  start: vi.fn<(input: unknown) => Promise<AuditResponse>>(),
}));

vi.mock(import("../../lib/database/client"), () => ({
  fetchClient: {
    mutate: {
      agentRun: auditMocks,
    },
    query: {},
  } as never,
}));

import {
  agentRunAttemptIdFor,
  agentRunIdFor,
  createAgentRunAudit,
} from "./agent-run-audit";

const startInput = () => ({
  attemptNumber: 1,
  input: {
    threadIds: ["thread-1"],
    triggers: [{ kind: "message" as const }],
  },
  options: {},
  organizationId: "org-1",
  pipelineJobId: "pipeline-1",
  queueJobId: "queue-1",
  queueName: "thread-pipeline",
  rawQueuePayload: {
    threadId: "thread-1",
    triggers: [{ kind: "message" }],
  },
  threadId: "thread-1",
});

describe("agent run audit transport", () => {
  beforeEach(() => {
    auditMocks.appendEvents.mockReset().mockResolvedValue({ inserted: 1 });
    auditMocks.complete.mockReset().mockResolvedValue({
      attemptId: "attempt-1",
      runId: "run-1",
    });
    auditMocks.start.mockReset().mockResolvedValue({
      attemptId: "attempt-1",
      runId: "run-1",
    });
  });

  it("derives stable logical and attempt ids", () => {
    const identity = {
      pipelineJobId: "pipeline-1",
      queueJobId: "queue-1",
      queueName: "thread-pipeline",
      threadId: "thread-1",
    };

    expect(agentRunIdFor(identity)).toBe(agentRunIdFor(identity));
    expect(agentRunAttemptIdFor("run-1", 1)).not.toBe(
      agentRunAttemptIdFor("run-1", 2)
    );
  });

  it("serializes observable evidence and preserves event order", async () => {
    const audit = await createAgentRunAudit(startInput());
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    audit.record("context.captured", { circular, count: 3n });
    await audit.flush();

    const firstBatch = auditMocks.appendEvents.mock.calls[0]?.[0];
    if (!firstBatch?.events[0]) {
      throw new Error("Expected an audit event batch");
    }
    const event = firstBatch.events[0];
    expect(event.sequence).toBe(0);
    expect(JSON.parse(event.payloadStr)).toStrictEqual({
      circular: { self: "[Circular]" },
      count: "3n",
    });
    expect(event.payloadHash).toMatch(/^[a-f0-9]{64}$/);

    await audit.complete("completed", { httpStatus: 200 });

    expect(auditMocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        auditIncomplete: false,
        status: "completed",
      })
    );
  });

  it("does not make audit transport failure affect the worker", async () => {
    const warning = vi.spyOn(log, "warn").mockImplementation(() => {});
    auditMocks.start.mockRejectedValueOnce(new Error("audit unavailable"));

    try {
      const audit = await createAgentRunAudit(startInput());
      audit.record("run.failed", { reason: "pipeline failure" });

      await expect(audit.complete("failed")).resolves.toBeUndefined();
      expect(auditMocks.appendEvents).not.toHaveBeenCalled();
      expect(auditMocks.complete).not.toHaveBeenCalled();
      expect(warning).toHaveBeenCalledWith(
        expect.objectContaining({ event: "start_failed" })
      );
    } finally {
      warning.mockRestore();
    }
  });

  it("marks the run incomplete when an append fails but still completes", async () => {
    auditMocks.appendEvents.mockRejectedValueOnce(new Error("write failed"));
    const warning = vi.spyOn(log, "warn").mockImplementation(() => {});

    try {
      const audit = await createAgentRunAudit(startInput());
      audit.record("model.completed", { status: "completed" });

      await audit.complete("completed");

      expect(auditMocks.complete).toHaveBeenCalledWith(
        expect.objectContaining({ auditIncomplete: true })
      );
    } finally {
      warning.mockRestore();
    }
  });
});
