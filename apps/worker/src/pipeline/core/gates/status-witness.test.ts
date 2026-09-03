import {
  STATUS_CLOSED,
  STATUS_IN_PROGRESS,
  STATUS_OPEN,
  STATUS_RESOLVED,
} from "@workspace/schemas/signals";
import type { Action, StatusWitnessClass } from "@workspace/schemas/signals";
import type { ExternalEntityOutcome } from "@workspace/schemas/signals";
import { describe, expect, it } from "vitest";

import type { RunState } from "../run-state";
import { statusWitnessGate } from "./status-witness";

const run = {} as RunState;

const setStatus = (
  status: number,
  witnessClass?: StatusWitnessClass,
  sources: string[] = ["m1"],
  outcome?: ExternalEntityOutcome
): Action => ({
  kind: "set_status",
  status,
  ...(witnessClass
    ? { witness: { class: witnessClass, sources, ...(outcome ? { outcome } : {}) } }
    : {}),
});

const groundedReply: Action = {
  kind: "reply",
  draftMarkdown: "Glad that's sorted.",
  grounding: { class: "documented", entityUrl: null, sources: ["doc-1"] },
};

const ungroundedReply: Action = {
  kind: "reply",
  draftMarkdown: "Glad that's sorted.",
  grounding: { class: "inferred", entityUrl: null, sources: [] },
};

const gate = (action: Action, autoSiblings: Action[] = []) =>
  statusWitnessGate(action, { autoSiblings, run });

describe(statusWitnessGate, () => {
  it("passes live-status moves without a witness", async () => {
    await expect(gate(setStatus(STATUS_OPEN))).resolves.toMatchObject({
      allowed: true,
    });
    await expect(gate(setStatus(STATUS_IN_PROGRESS))).resolves.toMatchObject({
      allowed: true,
    });
  });

  it("denies finishing with no witness at all", async () => {
    await expect(gate(setStatus(STATUS_CLOSED))).resolves.toMatchObject({
      allowed: false,
      reason: "witness_missing",
    });
  });

  it("denies a witness class that cannot justify the destination", async () => {
    // `abandoned` justifies Closed, never Resolved.
    await expect(
      gate(setStatus(STATUS_RESOLVED, "abandoned"), [groundedReply])
    ).resolves.toMatchObject({ allowed: false });
    await expect(
      gate(setStatus(STATUS_CLOSED, "customer_confirmed"))
    ).resolves.toMatchObject({ allowed: false });
  });

  it("never lets `inferred` finish a thread", async () => {
    await expect(
      gate(setStatus(STATUS_RESOLVED, "inferred"), [groundedReply])
    ).resolves.toMatchObject({ allowed: false });
  });

  it("denies a sourceless witness that claims to point at something", async () => {
    await expect(
      gate(setStatus(STATUS_RESOLVED, "customer_confirmed", []), [
        groundedReply,
      ])
    ).resolves.toMatchObject({
      allowed: false,
      reason: "witness_unsourced:customer_confirmed",
    });
  });

  it("allows `abandoned` → Closed with no sources and no reply", async () => {
    // Nobody is left to tell, so the reply requirement does not apply here.
    await expect(
      gate(setStatus(STATUS_CLOSED, "abandoned", []))
    ).resolves.toMatchObject({ allowed: true });
  });

  it("denies resolving when no reply is executing alongside it", async () => {
    await expect(
      gate(setStatus(STATUS_RESOLVED, "customer_confirmed"))
    ).resolves.toMatchObject({
      allowed: false,
      reason: "resolve_without_reply",
    });
  });

  it("denies resolving when the sibling reply is itself ungrounded", async () => {
    // An `inferred` reply will be held back by its own gate, so counting it
    // would resolve the thread and tell the customer nothing.
    await expect(
      gate(setStatus(STATUS_RESOLVED, "customer_confirmed"), [ungroundedReply])
    ).resolves.toMatchObject({
      allowed: false,
      reason: "resolve_without_reply",
    });
  });

  it("allows a witnessed resolve bundled with a sending reply", async () => {
    await expect(
      gate(setStatus(STATUS_RESOLVED, "customer_confirmed"), [groundedReply])
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      gate(
        setStatus(
          STATUS_RESOLVED,
          "entity_settled",
          ["https://pr/1"],
          "delivered"
        ),
        [groundedReply]
      )
    ).resolves.toMatchObject({ allowed: true });
  });

  it("keeps non-delivered entity outcomes human-reviewed", async () => {
    for (const outcome of ["declined", "superseded", "unknown"] as const) {
      await expect(
        gate(
          setStatus(
            STATUS_RESOLVED,
            "entity_settled",
            ["https://issue/1"],
            outcome
          ),
          [groundedReply]
        )
      ).resolves.toMatchObject({
        allowed: false,
        reason: `entity_outcome_not_delivered:${outcome}`,
      });
    }
  });

  it("does not trust a legacy entity witness without an outcome", async () => {
    await expect(
      gate(setStatus(STATUS_RESOLVED, "entity_settled", ["https://pr/1"]), [
        groundedReply,
      ])
    ).resolves.toMatchObject({
      allowed: false,
      reason: "entity_outcome_not_delivered:missing",
    });
  });
});
