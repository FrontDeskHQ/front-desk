import type { Action } from "@workspace/schemas/signals";
import { STATUS_RESOLVED } from "@workspace/schemas/signals";
import { describe, expect, it, vi } from "vitest";

import { executeBundle } from "./execute-bundle";
import type { ActionHandlerRegistry, ExecutionContext } from "./types";

const reply: Action = {
  draftMarkdown: "This is fixed now.",
  grounding: { class: "state_report", entityUrl: "https://example.com/1", sources: [] },
  kind: "reply",
};
const finish: Action = {
  kind: "set_status",
  status: STATUS_RESOLVED,
  witness: {
    class: "entity_settled",
    outcome: "delivered",
    sources: ["https://example.com/1"],
  },
};

const context = {
  organizationId: "org-1",
  threadId: "thread-1",
} as ExecutionContext;

describe(executeBundle, () => {
  it("persists a reply before finishing the thread regardless of input order", async () => {
    const calls: string[] = [];
    const registry = {
      reply: { apply: vi.fn(async () => calls.push("reply")) },
      set_status: { apply: vi.fn(async () => calls.push("set_status")) },
    } as unknown as ActionHandlerRegistry;

    const result = await executeBundle([finish, reply], registry, context);

    expect(result.failed).toBeNull();
    expect(calls).toEqual(["reply", "set_status"]);
  });

  it("leaves the finishing status unapplied when the reply fails", async () => {
    const statusApply = vi.fn();
    const registry = {
      reply: {
        apply: vi.fn(async () => {
          throw new Error("send failed");
        }),
      },
      set_status: { apply: statusApply },
    } as unknown as ActionHandlerRegistry;

    const result = await executeBundle([finish, reply], registry, context);

    expect(result.failed?.action.kind).toBe("reply");
    expect(statusApply).not.toHaveBeenCalled();
  });

  it("persists a reply before marking the thread as duplicate", async () => {
    const calls: string[] = [];
    const duplicate: Action = {
      kind: "mark_duplicate",
      targetThreadId: "thread-canonical",
    };
    const registry = {
      mark_duplicate: {
        apply: vi.fn(async () => calls.push("mark_duplicate")),
      },
      reply: { apply: vi.fn(async () => calls.push("reply")) },
    } as unknown as ActionHandlerRegistry;

    const result = await executeBundle(
      [duplicate, reply],
      registry,
      context
    );

    expect(result.failed).toBeNull();
    expect(calls).toEqual(["reply", "mark_duplicate"]);
  });
});
