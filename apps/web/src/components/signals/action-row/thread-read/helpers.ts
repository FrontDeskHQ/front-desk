import {
  ACTION_KIND_VERB,
  ACTION_KIND_VERB_PAST,
  STATUS_CLOSED,
  STATUS_DUPLICATED,
  STATUS_IN_PROGRESS,
  STATUS_OPEN,
  STATUS_RESOLVED,
} from "@workspace/schemas/signals";
import type { Action, ReplyAction } from "@workspace/schemas/signals";

export interface SelectedAction {
  action: Action;
  index: number;
}

export function primaryReplyAction(primary: Action[]): ReplyAction | undefined {
  return primary.find(
    (action): action is ReplyAction => action.kind === "reply"
  );
}

export function primaryReplyDraftMarkdown(primary: Action[]): string {
  return primaryReplyAction(primary)?.draftMarkdown ?? "";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Selected bundle actions in display order: reply always leads, the rest keep
 * their original bundle order.
 */
export function orderReplyFirst(
  primary: Action[],
  selected: ReadonlySet<number>
): SelectedAction[] {
  return primary
    .map((action, index): SelectedAction => ({ action, index }))
    .filter(({ index }) => selected.has(index))
    .toSorted((a, b) => {
      const aReply = a.action.kind === "reply" ? 0 : 1;
      const bReply = b.action.kind === "reply" ? 0 : 1;
      if (aReply !== bReply) {
        return aReply - bReply;
      }
      return a.index - b.index;
    });
}

/**
 * Compose the compound-action button copy from the current selection, e.g.
 * "Reply and close", "Reply and do 2 actions", or — once the reply editor is
 * open — "Send and close". The leading verb becomes "Send" while editing.
 */
export function compoundButtonLabel(
  ordered: SelectedAction[],
  replyEditorOpen: boolean
): string {
  if (ordered.length === 0) {
    return "Select an action";
  }

  const verbAt = (entry: SelectedAction, position: number): string => {
    if (entry.action.kind === "reply" && replyEditorOpen) {
      return position === 0 ? "Send" : "send";
    }
    return ACTION_KIND_VERB[entry.action.kind];
  };

  const first = capitalize(verbAt(ordered[0], 0));
  if (ordered.length === 1) {
    return first;
  }
  if (ordered.length === 2) {
    return `${first} and ${verbAt(ordered[1], 1)}`;
  }
  return `${first} and do ${ordered.length - 1} actions`;
}

function uncapitalize(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function actionAppliedPhrase(action: Action): string {
  switch (action.kind) {
    case "reply":
      return "Reply sent";
    case "apply_label":
      return "Label applied";
    case "create_issue":
      return "Issue filed";
    case "link_issue":
      return "Issue linked";
    case "link_pr":
      return "Pull request linked";
    case "mark_duplicate":
      return "Marked as duplicate";
    case "set_status":
      switch (action.status) {
        case STATUS_RESOLVED:
          return "Thread resolved";
        case STATUS_CLOSED:
          return "Thread closed";
        case STATUS_DUPLICATED:
          return "Marked as duplicate";
        case STATUS_OPEN:
          return "Thread reopened";
        case STATUS_IN_PROGRESS:
          return "Moved to in progress";
        default:
          return "Status updated";
      }
  }
}

/**
 * Past-tense confirmation of the actions that just ran, e.g. "Reply sent",
 * "Reply sent and thread resolved", or "Reply sent and 2 other actions applied".
 */
export function acceptToastMessage(actions: Action[]): string {
  if (actions.length === 0) {
    return "Actions applied";
  }
  const first = actionAppliedPhrase(actions[0]);
  if (actions.length === 1) {
    return first;
  }
  if (actions.length === 2) {
    return `${first} and ${uncapitalize(actionAppliedPhrase(actions[1]))}`;
  }
  return `${first} and ${actions.length - 1} other actions applied`;
}

export function formatErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("STALE_AGENT_READ")) {
    return "This signal changed in the background. Refresh and try again.";
  }
  // A read can outlive the configuration it was built against: the org may have
  // cleared its default issue target (or disabled the tracker) after synthesis
  // proposed create_issue. Retrying will never work, so say what to change
  // instead of offering the generic try-again.
  if (message.includes("DEFAULT_ISSUE_TARGET_NOT_CONFIGURED")) {
    return "No issue target is available. Connect a repository in Integrations settings.";
  }
  if (message.includes("ISSUE_TRACKER_NOT_CONFIGURED")) {
    return "This organization has no configured issue tracker.";
  }
  // Raised by the connector, which owns target validation — core treats the
  // integration config as opaque and cannot check the target up front.
  if (message.includes("REPOSITORY_NOT_CONNECTED")) {
    return "The configured issue target is no longer connected. Pick another in Integrations settings.";
  }
  return "Could not apply this signal. Please try again.";
}

/**
 * One line describing what the Agent already did on this read, e.g. "Agent
 * replied" or "Agent replied and marked this a duplicate". Null when nothing
 * ran — the ordinary case, where every action is still awaiting a human.
 */
export function executedSummary(executed: Action[] | undefined): string | null {
  if (!executed || executed.length === 0) {
    return null;
  }
  const phrases = executed.map((action) => ACTION_KIND_VERB_PAST[action.kind]);
  const joined =
    phrases.length === 1
      ? phrases[0]
      : `${phrases.slice(0, -1).join(", ")} and ${phrases.at(-1)}`;
  return `Agent already ${joined}`;
}
