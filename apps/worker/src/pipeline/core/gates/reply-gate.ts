import type { MessageRole } from "@workspace/schemas/message-roles";
import type { Action, ReplyGrounding } from "@workspace/schemas/signals";
import {
  inferredGrounding,
  replyStateFingerprint,
} from "@workspace/schemas/signals";

import {
  fetchMirroredIssueByUrl,
  fetchMirroredPrByUrl,
} from "../../../lib/database/client";
import { newestMessage } from "../../../lib/message-order";
import type { ActionGate, ActionGateResult } from "../action-gates";

/**
 * Reply's [action gate](../../../../../CONTEXT.md): the last thing between a
 * drafted reply and a customer's inbox. It asks two things — whether the draft
 * is grounded, and whether there is anyone to send it as.
 *
 * It does not check that cited documentation URLs are real. That needs the
 * synthesis run's tool steps, so it happens at that trust boundary
 * (`grounding-verification.ts`), which degrades a fabricated citation to
 * `inferred` well before the action arrives here.
 */
export const replyGate: ActionGate = async (action, ctx) => {
  if (action.kind !== "reply") {
    return { allowed: true };
  }

  // An autonomous reply goes out as the thread's assignee, the Agent having no
  // identity of its own (ADR 0017), so an unassigned thread has nobody to send
  // as. A gate and not availability: a human accepting the read supplies
  // themselves as the sender, so only the autonomous path is blocked.
  if (!ctx.run.thread.assignedUserId) {
    return deny("no_sender");
  }

  const grounding: ReplyGrounding = action.grounding ?? inferredGrounding();

  if (grounding.class === "inferred") {
    return deny("ungrounded");
  }

  let entityState: string | null = null;

  if (grounding.class === "documented") {
    if (grounding.sources.length === 0) {
      return deny("documented_without_sources");
    }
  } else {
    const entityUrl = grounding.entityUrl?.trim() ?? "";
    if (!entityUrl) {
      return deny("state_report_without_entity");
    }
    const resolved = await resolveReportedEntity(
      ctx.run.organizationId,
      ctx.run.thread,
      ctx.autoSiblings,
      entityUrl
    );
    if ("denied" in resolved) {
      return deny(resolved.denied);
    }
    entityState = resolved.state;
  }

  const fingerprint = replyStateFingerprint(grounding, entityState);

  // A run usually happens because the customer wrote, so the Agent is
  // answering rather than interrupting. The case to guard is the other one: a
  // detector-driven run on a thread where the last word was ours.
  const { roles } = await ctx.run.authors();
  if (lastMessageRole(ctx.run.thread.messages ?? [], roles) === "customer") {
    return { allowed: true, stateFingerprint: fingerprint };
  }

  // Speaking twice in a row is licensed by the state having moved, never by
  // elapsed time — a clock keeps ticking whether or not there is anything new
  // to say. No prior receipt means the last word was a teammate's, and the
  // Agent does not talk over one.
  const previous = await ctx.run.lastAutonomousReply();
  if (!previous || previous.stateFingerprint === fingerprint) {
    return deny("no_new_state_since_last_reply");
  }

  return { allowed: true, stateFingerprint: fingerprint };
};

const deny = (reason: string): ActionGateResult => ({ allowed: false, reason });

/** Who spoke last, or "unknown" on an empty thread. */
const lastMessageRole = (
  messages: { authorId: string; createdAt: unknown; id: string }[],
  roles: Map<string, MessageRole>
): MessageRole => {
  const last = newestMessage(messages);
  return last ? (roles.get(last.authorId) ?? "unknown") : "unknown";
};

/**
 * Resolve the entity a `state_report` names and confirm the thread is attached
 * to it — already, or by a sibling link that is itself executing on this run.
 * `link_pr` ships at `off`, so without the sibling half a `[link_pr, reply]`
 * bundle would drop the link and still tell the customer "tracked in #412".
 */
const resolveReportedEntity = async (
  organizationId: string,
  thread: { externalPrId?: string | null; externalIssueId?: string | null },
  autoSiblings: Action[],
  entityUrl: string
): Promise<{ state: string } | { denied: string }> => {
  const pr = await fetchMirroredPrByUrl(organizationId, entityUrl);
  const entity =
    pr ?? (await fetchMirroredIssueByUrl(organizationId, entityUrl));

  if (!entity) {
    return { denied: "state_report_entity_not_mirrored" };
  }

  // `externalKey`, not `id`: the link handlers write the provider's key into
  // `thread.externalPrId` / `externalIssueId`, so comparing mirror row ids here
  // would never match and would downgrade every already-linked state report.
  const alreadyLinked =
    thread.externalPrId === entity.externalKey ||
    thread.externalIssueId === entity.externalKey;

  if (!alreadyLinked && !siblingLinksUrl(autoSiblings, entityUrl)) {
    return { denied: "state_report_entity_not_linked" };
  }

  return { state: describeEntityState(entity) };
};

const siblingLinksUrl = (siblings: Action[], url: string): boolean =>
  siblings.some(
    (sibling) =>
      (sibling.kind === "link_pr" && sibling.prUrl.trim() === url) ||
      (sibling.kind === "link_issue" && sibling.issueUrl.trim() === url)
  );

/**
 * Merge state is folded in on purpose: "there's a fix open" and "the fix has
 * merged" are different things to tell a customer, and collapsing them would
 * make the follow-up the Agent most *should* send look like a repeat.
 */
const describeEntityState = (entity: {
  state: string;
  merged?: boolean | null;
  draft?: boolean | null;
}): string =>
  [entity.state, entity.merged ? "merged" : "", entity.draft ? "draft" : ""]
    .filter(Boolean)
    .join("+");
