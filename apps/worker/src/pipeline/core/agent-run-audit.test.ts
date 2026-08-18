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
  queueGeneration: 1,
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
    expect(agentRunIdFor({ ...identity, queueGeneration: 1 })).toBe(
      agentRunIdFor({ ...identity, queueGeneration: 1 })
    );
    expect(agentRunIdFor({ ...identity, queueGeneration: 1 })).not.toBe(
      agentRunIdFor({ ...identity, queueGeneration: 2 })
    );
    expect(agentRunAttemptIdFor("run-1", 1)).not.toBe(
      agentRunAttemptIdFor("run-1", 2)
    );
  });

  it("serializes observable evidence and preserves event order", async () => {
    const audit = await createAgentRunAudit(startInput());
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const shared = { kind: "reply", value: "same object twice" };
    const errorEvidence: Record<string, unknown> = {
      error: new Error("model failed"),
    };
    errorEvidence.self = errorEvidence;

    audit.record("context.captured", {
      circular,
      count: 3n,
      errorEvidence,
      first: shared,
      second: shared,
    });
    audit.record("hint.computed", { status: "complete" });
    await audit.flush();

    const firstBatch = auditMocks.appendEvents.mock.calls[0]?.[0];
    if (!firstBatch?.events[0] || !firstBatch.events[1]) {
      throw new Error("Expected an audit event batch");
    }
    expect(firstBatch.events.map((event) => event.sequence)).toStrictEqual([
      0, 1,
    ]);
    expect(JSON.parse(firstBatch.events[0].payloadStr)).toStrictEqual({
      circular: { self: "[Circular]" },
      count: "3n",
      errorEvidence: {
        error: {
          message: "model failed",
          name: "Error",
          stack: expect.any(String),
        },
        self: "[Circular]",
      },
      first: shared,
      second: shared,
    });
    expect(firstBatch.events[0].payloadHash).toMatch(/^[a-f0-9]{64}$/);

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

  it("reconciles a start that settles after its timeout", async () => {
    let resolveStart!: (response: AuditResponse) => void;
    auditMocks.start.mockReturnValueOnce(
      new Promise<AuditResponse>((resolve) => {
        resolveStart = resolve;
      })
    );

    const audit = await createAgentRunAudit(startInput());
    const completion = audit.complete("completed");
    setTimeout(
      () =>
        resolveStart({
          attemptId: "attempt-1",
          runId: "run-1",
        }),
      600
    );

    await completion;
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(auditMocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        auditIncomplete: true,
        status: "completed",
      })
    );
  });

  it("reconciles a completion that settles after its timeout", async () => {
    auditMocks.complete
      .mockReturnValueOnce(
        new Promise<AuditResponse>((resolve) => {
          setTimeout(
            () => resolve({ attemptId: "attempt-1", runId: "run-1" }),
            600
          );
        })
      )
      .mockResolvedValueOnce({ attemptId: "attempt-1", runId: "run-1" });

    const audit = await createAgentRunAudit(startInput());
    await audit.complete("completed");
    await new Promise((resolve) => setTimeout(resolve, 650));

    expect(auditMocks.complete).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        auditIncomplete: true,
        status: "completed",
      })
    );
  });
});
