import type { ResolvedMessageAuthors } from "@workspace/schemas/message-roles";
import { resolveAuthorsFromRows } from "@workspace/schemas/message-roles";
import { safeParseOrgSettings } from "@workspace/schemas/organization";
import {
  getDefaultActionAutonomy,
  parseAutonomousActionMetadata,
} from "@workspace/schemas/signals";
import type {
  Action,
  ActionAvailability,
  ActionExecutionResult,
  ActionKind,
  AutonomyLevel,
  DuplicateEvidence,
  HintKind,
  HintSlot,
  Hints,
  InlineSuggestion,
  RelatedDocsEvidence,
  RelatedIssuesEvidence,
  RelatedPrsEvidence,
  ReplyGrounding,
  ThreadRead,
} from "@workspace/schemas/signals";
import { log } from "@workspace/utils/logging";

import { fetchClient } from "../../lib/database/client";
import { errorFields } from "../../lib/logging";
import type { Thread } from "../../types";

/** An organization label, as the label classifier consumes it. */
export interface OrgLabel {
  id: string;
  name: string;
  organizationId: string;
}

/**
 * Which evidence shape belongs in which hint slot. Exported so hint processors
 * can be typed against the same correspondence this class enforces.
 */
export interface SlotEvidenceMap {
  duplicate: DuplicateEvidence;
  related_docs: RelatedDocsEvidence;
  related_prs: RelatedPrsEvidence;
  related_issues: RelatedIssuesEvidence;
}

/**
 * Nothing available — the fallback when availability can't be resolved. A
 * transient API failure must not let synthesis propose a move that then fails
 * at execution; skipping the offer for one run is the cheaper mistake.
 */
const NO_AVAILABILITY: ActionAvailability = { create_issue: false };

/**
 * The transport failed while hydrating a [run](../../../../CONTEXT.md). Thrown
 * rather than degraded so the job rejects and BullMQ retries: a run that
 * proceeds without its thread would write conclusions drawn from nothing. A
 * thread that is genuinely absent (deleted mid-flight) is *not* this — it is
 * simply missing from the hydrated map, and the orchestrator skips it.
 */
export class RunHydrationError extends Error {
  constructor(cause: unknown) {
    super("Failed to hydrate run state", { cause });
    this.name = "RunHydrationError";
  }
}

/**
 * Everything one [run](../../../../CONTEXT.md) knows and writes about its
 * thread: the thread itself, its [read hints](../../../../CONTEXT.md), its
 * organization's autonomy policy and [action availability](../../../../CONTEXT.md),
 * and its authors.
 *
 * **No processor reaches past this.** Every read and write a processor makes
 * about *its own thread* goes through here, which is why the one execution
 * member (`executeBundle`) sits on an otherwise state-shaped interface. Three
 * modules under `pipeline/` still hold their own `fetchClient`, each
 * deliberately: `idempotency.ts` and `persistence.ts` are job bookkeeping, not
 * thread state, and synthesis' `tools.ts` reads *other* threads and the
 * external mirror on demand — depth, not the run's working set.
 *
 * **Hints are write-through.** `synthesis` depends on the four hint processors,
 * so they write their slots in an earlier turn and synthesis reads the bag in a
 * later one. The seed carries the slots persisted by *previous* runs; each
 * `writeHint` updates the remote row and then its own (disjoint) local slot. So
 * `hints()` returns prior slots merged with this run's writes — the same bag the
 * old re-fetch produced, without the round trip.
 *
 * **Org reads are lazy and memoized once per run.** A run whose processors all
 * skip never pays for an organization it does not read.
 *
 * **Failure.** `availability()` degrades to "nothing available" because its
 * failure only ever *narrows* what the Agent is offered. Everything else throws:
 * a failed autonomy or author read would change what the Agent *does*, not just
 * what it sees, and a retry is the correct answer to that.
 */
export class RunState {
  readonly thread: Thread;
  readonly threadId: string;
  readonly organizationId: string;

  #hints: Hints;
  #autonomy?: Promise<Record<ActionKind, AutonomyLevel>>;
  #availability?: Promise<ActionAvailability>;
  #authors?: Promise<ResolvedMessageAuthors>;
  #labels?: Promise<OrgLabel[]>;
  #lastAutonomousReply?: Promise<{ stateFingerprint: string } | null>;

  constructor(thread: Thread) {
    this.thread = thread;
    this.threadId = thread.id;
    this.organizationId = thread.organizationId;
    this.#hints = { ...(thread.hints as Hints | null) };
  }

  /**
   * The run's hint bag: slots persisted by earlier runs, merged with slots
   * written during this one. Synchronous — every other member costs a round
   * trip, and the interface should say so.
   */
  hints(): Hints {
    return this.#hints;
  }

  /**
   * Writes a single hint slot, remote first then local. The read-modify-write of
   * `thread.hints` runs server-side inside a transaction (see `runWriteHintSlot`)
   * so hint processors finishing in the same parallel turn don't clobber each
   * other's slots via last-writer-wins; the local update is safe alongside it
   * because each processor owns a distinct slot.
   */
  async writeHint<K extends HintKind>(
    kind: K,
    evidence: SlotEvidenceMap[K] | null,
    hash: string
  ): Promise<void> {
    const slot: HintSlot<SlotEvidenceMap[K]> = {
      computedAt: new Date().toISOString(),
      evidence,
      hash,
    };

    // The procedure's input is a union discriminated on `kind`, which TypeScript
    // cannot correlate with a still-generic `K`. `SlotEvidenceMap` is that same
    // correspondence, enforced at every call site, so the pairing is checked
    // where it matters — this cast only restates it for the wire.
    await fetchClient.mutate.thread.writeHintSlot({
      kind,
      organizationId: this.organizationId,
      slot,
      threadId: this.threadId,
    } as Parameters<typeof fetchClient.mutate.thread.writeHintSlot>[0]);

    this.#hints = { ...this.#hints, [kind]: slot };
  }

  /**
   * Persists the thread read, or clears it with `null` — which is also how a
   * `supersede` trigger drops a read without invoking synthesis.
   */
  async publishRead(read: ThreadRead | null): Promise<void> {
    await fetchClient.mutate.thread.setAgentRead({
      agentRead: read,
      organizationId: this.organizationId,
      threadId: this.threadId,
    });
  }

  /** Upserts an inline suggestion by id, server-side and transactional. */
  async suggest(suggestion: InlineSuggestion): Promise<void> {
    await fetchClient.mutate.thread.upsertInlineSuggestion({
      organizationId: this.organizationId,
      suggestion,
      threadId: this.threadId,
    });
  }

  /** The org's per-kind autonomy policy, over the built-in defaults. */
  autonomy(): Promise<Record<ActionKind, AutonomyLevel>> {
    this.#autonomy ??= (async () => {
      const org = (await fetchClient.query.organization.byId({
        id: this.organizationId,
      })) as { settings: unknown } | undefined;
      const parsed = safeParseOrgSettings(org?.settings);
      return { ...getDefaultActionAutonomy(), ...parsed.actionAutonomy };
    })();

    return this.#autonomy;
  }

  /**
   * What can actually execute on this run, resolved before synthesis so the
   * prompt and the output schema are shaped by it.
   *
   * Two narrowings, both required. The org's configuration answers whether it
   * *can* file at all; the thread answers whether filing again is meaningful. A
   * thread links a single issue, so `create_issue` against an already-linked
   * thread is refused at execution (`ALREADY_LINKED`). Without the thread check
   * synthesis keeps the verb in its vocabulary with nothing to argue it down —
   * the `related_issues` hint is *cleared* once a thread links an issue, so an
   * empty hint bag reads as "no existing issue covers this" — and re-offers a
   * file that can only ever error. `link_issue` is deliberately not narrowed:
   * re-linking a thread to a *different* issue is a legal move.
   *
   * This is not autonomy: autonomy is whether the org has *permitted* the Agent,
   * applied afterwards by the autonomy stage. Keeping them apart matters twice
   * over — an unavailable action is not the org choosing `off`, and folding
   * availability into autonomy would still spend the whole read before
   * discarding it.
   */
  availability(): Promise<ActionAvailability> {
    this.#availability ??= (async () => {
      // Nothing else is availability-gated yet, so a linked thread
      // short-circuits the round trip entirely.
      if (this.thread.externalIssueId) {
        return NO_AVAILABILITY;
      }

      try {
        return await fetchClient.query.organization.actionAvailability({
          organizationId: this.organizationId,
        });
      } catch (error) {
        log.error({
          action: "worker.action_availability",
          event: "resolve_failed",
          organizationId: this.organizationId,
          threadId: this.threadId,
          error: errorFields(error),
          outcome: "treated_as_unavailable",
        });
        return NO_AVAILABILITY;
      }
    })();

    return this.#availability;
  }

  /**
   * Display names and message roles (`@workspace/schemas/message-roles`) for
   * everyone who wrote on this thread. The author ids come from the thread itself, so
   * callers never assemble them.
   */
  authors(): Promise<ResolvedMessageAuthors> {
    this.#authors ??= (async () => {
      const ids = [
        ...this.thread.messages.map((message) => message.authorId),
        ...(this.thread.authorId ? [this.thread.authorId] : []),
      ];
      const unique = [...new Set(ids.filter(Boolean))];
      const rows = await fetchClient.query.author.byIds({
        ids: unique,
        organizationId: this.organizationId,
      });
      return resolveAuthorsFromRows(rows, this.thread.authorId);
    })();

    return this.#authors;
  }

  /** The org's enabled labels — the label classifier's vocabulary. */
  labels(): Promise<OrgLabel[]> {
    this.#labels ??= fetchClient.query.label.forOrg({
      enabled: true,
      organizationId: this.organizationId,
    }) as Promise<OrgLabel[]>;

    return this.#labels;
  }

  /**
   * What the Agent last auto-replied here, or null if it never has. Read lazily:
   * only a run that gets as far as gating a reply pays for it.
   */
  lastAutonomousReply(): Promise<{ stateFingerprint: string } | null> {
    this.#lastAutonomousReply ??= (async () => {
      const row = await fetchClient.query.autonomousAction.latestReplyForThread(
        {
          organizationId: this.organizationId,
          threadId: this.threadId,
        }
      );
      const metadata = parseAutonomousActionMetadata(row?.metadataStr ?? null);
      return metadata?.kind === "reply"
        ? { stateFingerprint: metadata.stateFingerprint }
        : null;
    })();

    return this.#lastAutonomousReply;
  }

  /**
   * Written from the worker, unlike every other receipt: the fingerprint comes
   * from the [action gate](./action-gates.ts), the only place that knows what
   * the reply claimed to report.
   */
  async recordReplyReceipt(
    grounding: ReplyGrounding,
    stateFingerprint: string
  ): Promise<void> {
    await fetchClient.mutate.autonomousAction.record({
      actionKind: "reply",
      entityId: this.threadId,
      metadata: { grounding, kind: "reply", stateFingerprint },
      organizationId: this.organizationId,
    });
  }

  /** Executes an approved action bundle and writes its autonomous receipts. */
  executeBundle(actions: Action[]): Promise<ActionExecutionResult> {
    return fetchClient.mutate.thread.executeAutonomousBundle({
      actions,
      organizationId: this.organizationId,
      threadId: this.threadId,
    });
  }
}

/**
 * Seeds one {@link RunState} per requested thread. Threads the API does not
 * return are simply absent from the map — the orchestrator reports them as
 * missing. A transport failure is not that case and raises
 * {@link RunHydrationError}.
 */
export const hydrateRunStates = async (
  threadIds: string[]
): Promise<Map<string, RunState>> => {
  const runStates = new Map<string, RunState>();

  if (threadIds.length === 0) {
    return runStates;
  }

  let threads: Thread[];
  try {
    threads = (await fetchClient.query.thread.byIds({
      ids: threadIds,
    })) as Thread[];
  } catch (error) {
    throw new RunHydrationError(error);
  }

  for (const thread of threads) {
    runStates.set(thread.id, new RunState(thread));
  }

  return runStates;
};
