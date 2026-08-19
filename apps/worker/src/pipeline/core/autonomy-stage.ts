import {
  inferredGrounding,
  nextAgentReadAfterExecution,
} from "@workspace/schemas/signals";
import type {
  Action,
  ActionKind,
  AutonomyLevel,
  ThreadRead,
} from "@workspace/schemas/signals";
import { log } from "@workspace/utils/logging";

import { errorFields } from "../../lib/logging";
import { gateFor, gateRank } from "./action-gates";
import type { ActionGateResult } from "./action-gates";
import type { RunState } from "./run-state";

const keepForRead = (
  action: Action,
  autonomy: Record<ActionKind, AutonomyLevel>
) => autonomy[action.kind] !== "off";

/**
 * The [autonomy stage](../../../../../CONTEXT.md) for synthesis: applies the org's
 * per-kind policy to a raw action set, auto-executes the primary actions set to
 * `auto`, then persists the resulting [thread read](../../../../../CONTEXT.md) (or
 * null when no substantive move remains).
 *
 * A free function over {@link RunState} rather than a method on it: this is
 * policy, not state. Keeping it outside the handle is also what lets it move
 * behind the API seam later without dragging the rest of the run's state along.
 */
export const applySynthesisAutonomy = async (
  run: RunState,
  rawActionSet: ThreadRead | null
): Promise<ThreadRead | null> => {
  if (!rawActionSet) {
    run.recordAudit(
      "action.filtered",
      { reason: "no_raw_action_set" },
      { phase: "autonomy" }
    );
    await run.publishRead(null);
    return null;
  }

  const autonomy = await run.autonomy();
  run.recordAudit("autonomy.policy", { autonomy }, { phase: "autonomy" });

  const primary = rawActionSet.primary.filter((action) =>
    keepForRead(action, autonomy)
  );
  const alternatives = (rawActionSet.alternatives ?? []).filter((action) =>
    keepForRead(action, autonomy)
  );

  const filteredRead: ThreadRead = {
    ...rawActionSet,
    alternatives,
    primary,
  };

  run.recordAudit(
    "action.filtered",
    {
      alternatives: rawActionSet.alternatives ?? [],
      filteredRead,
      primary: rawActionSet.primary,
      removedAlternatives: (rawActionSet.alternatives ?? []).filter(
        (action) => !alternatives.includes(action)
      ),
      removedPrimary: rawActionSet.primary.filter(
        (action) => !primary.includes(action)
      ),
    },
    { phase: "autonomy" }
  );

  if (primary.length === 0) {
    await run.publishRead(null);
    return null;
  }

  const permitted = primary.filter(
    (action) => autonomy[action.kind] === "auto"
  );
  const suggestPrimary = primary.filter(
    (action) => autonomy[action.kind] === "suggest"
  );

  // Gates run *after* per-kind partitioning, never before: reply's gate has to
  // see which siblings are genuinely executing, or it would clear a reply that
  // cites a `link_pr` autonomy had already dropped.
  const { autoActions, gated, fingerprints } = await applyActionGates(
    run,
    permitted
  );

  // A gated action is not lost and does not veto its siblings — it joins the
  // `suggest` pile a human already reviews. Rebuilt by filtering `primary`
  // rather than concatenating the piles, because non-reversibles execute in
  // emitted order (ADR 0003) with reply terminal, and concatenating would
  // reverse that whenever a gate holds a reply back.
  const keepInReadOrder = (...piles: Action[][]): Action[] => {
    const keep = new Set<Action>(piles.flat());
    return primary.filter((action) => keep.has(action));
  };

  let finalPrimary = keepInReadOrder(gated, suggestPrimary);
  let executed: Action[] = [];

  if (autoActions.length > 0) {
    try {
      const result = await run.executeBundle(autoActions);

      run.recordAudit(
        "action.executed",
        {
          actions: result.succeeded,
          result,
        },
        { phase: "execution" }
      );

      if (result.failed) {
        run.recordAudit(
          "action.failed",
          {
            action: result.failed.action,
            error: result.failed.error,
            result,
          },
          { phase: "execution" }
        );
      }

      await writeReplyReceipt(run, result.succeeded, fingerprints);

      executed = result.succeeded;

      const afterAuto = nextAgentReadAfterExecution(
        { ...filteredRead, primary: autoActions },
        result
      );

      if (afterAuto?.primary.length) {
        finalPrimary = keepInReadOrder(
          afterAuto.primary,
          gated,
          suggestPrimary
        );
      }
    } catch (error) {
      run.recordAudit(
        "action.failed",
        { actions: autoActions, error },
        { phase: "execution" }
      );
      // TODO(idempotency): On an RPC/transport error we don't know whether the
      // server actually executed the bundle, so re-suggesting `autoActions` here
      // can replay non-idempotent actions (e.g. a duplicate reply) if it did.
      // Give execution idempotency keys so a retry/re-suggest is a safe no-op
      // when the original call already succeeded.
      log.error({
        action: "worker.synthesis_autonomy",
        event: "autonomous_bundle_failed",
        organizationId: run.organizationId,
        threadId: run.threadId,
        autoActionCount: autoActions.length,
        error: errorFields(error),
        outcome: "auto_actions_retained_for_review",
      });
      finalPrimary = keepInReadOrder(autoActions, gated, suggestPrimary);
    }
  }

  if (finalPrimary.length === 0) {
    await run.publishRead(null);
    return null;
  }

  const agentRead: ThreadRead = {
    ...filteredRead,
    // Alternatives are alternatives *to the primary bundle*. Once any part of
    // that bundle has actually run, offering a pick-one instead of it is a lie
    // — a rival reply would be a second message, not a substitute. Keyed on
    // what succeeded rather than on what was attempted: a bundle that failed
    // outright leaves exactly the read synthesis proposed, alternatives and
    // all.
    alternatives: executed.length > 0 ? [] : filteredRead.alternatives,
    executed: executed.length > 0 ? executed : undefined,
    primary: finalPrimary,
  };

  run.recordAudit(
    "action.suggested",
    {
      actions: finalPrimary,
      executed,
      gated,
      reason: "retained_for_review",
    },
    { phase: "autonomy" }
  );

  // TODO(read-generation): last write wins. A `message` run started while this
  // one was executing can publish a fresher read first, and this call then
  // overwrites it with a stale one. Needs a compare-and-set on `setAgentRead`
  // (a read generation carried through the run), not an ordering assumption
  // about the queue.
  await run.publishRead(agentRead);
  return agentRead;
};

/**
 * Splits the permitted actions into what still executes and what an
 * [action gate](./action-gates.ts) held back. A gate that throws denies: an
 * unreachable gate must fail towards the human, not past them.
 *
 * Gates see only siblings *confirmed* to execute — ungated kinds, plus gated
 * ones already admitted — and are evaluated in `GATE_ORDER` so a gate asking
 * about a sibling asks after that sibling's verdict is known. Feeding a gate
 * the whole proposed set instead would let `set_status` read a reply as
 * sending that the reply's own gate then held back, resolving a thread whose
 * customer hears nothing (ADR 0015).
 */
const applyActionGates = async (
  run: RunState,
  permitted: Action[]
): Promise<{
  autoActions: Action[];
  gated: Action[];
  fingerprints: Map<ActionKind, string>;
}> => {
  const gated: Action[] = [];
  const fingerprints = new Map<ActionKind, string>();

  const confirmed: Action[] = permitted.filter(
    (action) => !gateFor(action.kind)
  );
  const toEvaluate = permitted
    .flatMap((action) => {
      const gate = gateFor(action.kind);
      return gate ? [{ action, gate }] : [];
    })
    .toSorted((a, b) => gateRank(a.action.kind) - gateRank(b.action.kind));

  for (const action of confirmed) {
    run.recordAudit(
      "gate.evaluated",
      { action, allowed: true, reason: "no_gate" },
      { phase: "gate" }
    );
  }

  for (const { action, gate } of toEvaluate) {
    const siblings = confirmed.filter((other) => other !== action);
    let result: ActionGateResult;
    try {
      result = await gate(action, { autoSiblings: siblings, run });
    } catch (error) {
      result = { allowed: false, reason: "gate_failed" };
      log.error({
        action: "worker.action_gate",
        event: "gate_threw",
        organizationId: run.organizationId,
        threadId: run.threadId,
        actionKind: action.kind,
        error: errorFields(error),
        outcome: "downgraded_to_suggest",
      });
    }

    run.recordAudit(
      "gate.evaluated",
      {
        action,
        allowed: result.allowed,
        reason: result.allowed ? "allowed" : result.reason,
        stateFingerprint: result.allowed
          ? (result.stateFingerprint ?? null)
          : null,
      },
      { phase: "gate" }
    );

    if (result.allowed) {
      if (result.stateFingerprint) {
        fingerprints.set(action.kind, result.stateFingerprint);
      }
      confirmed.push(action);
      continue;
    }

    log.info({
      action: "worker.action_gate",
      event: "denied",
      organizationId: run.organizationId,
      threadId: run.threadId,
      actionKind: action.kind,
      reason: result.reason,
      outcome: "downgraded_to_suggest",
    });
    gated.push(action);
  }

  // Rebuilt in `permitted` order rather than in the order gates admitted them:
  // ADR 0003 executes a bundle in emitted order with reply terminal, and
  // `GATE_ORDER` is an evaluation order, not an execution one.
  const admitted = new Set(confirmed);
  const autoActions = permitted.filter((action) => admitted.has(action));

  return { autoActions, fingerprints, gated };
};

/**
 * Writes the receipt for a sent reply — the audit trail, and the record the
 * next run's gate compares against. A failed write must not fail the run: the
 * message has already gone out, and losing the receipt costs a conservative
 * denial next time, not a duplicate send.
 */
const writeReplyReceipt = async (
  run: RunState,
  succeeded: Action[],
  fingerprints: Map<ActionKind, string>
): Promise<void> => {
  const reply = succeeded.find((action) => action.kind === "reply");
  const fingerprint = fingerprints.get("reply");
  if (!reply || reply.kind !== "reply" || !fingerprint) {
    return;
  }

  try {
    await run.recordReplyReceipt(
      reply.grounding ?? inferredGrounding(),
      fingerprint
    );
  } catch (error) {
    log.error({
      action: "worker.synthesis_autonomy",
      event: "reply_receipt_failed",
      organizationId: run.organizationId,
      threadId: run.threadId,
      error: errorFields(error),
      outcome: "reply_sent_without_receipt",
    });
  }
};
