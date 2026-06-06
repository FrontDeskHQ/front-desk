import type { InferLiveObject } from "@live-state/sync";
import { Link } from "@tanstack/react-router";
import {
  ACTION_KIND_LABEL,
  ACTION_KIND_VERB,
  type Action,
  fingerprintAgentRead,
  type InlineSuggestion,
  type ReplyAction,
  STATUS_LABELS,
  sanitizeAgentReadReasoning,
  type ThreadRead,
  urgencyTierFromScore,
} from "@workspace/schemas/signals";
import { Avatar } from "@workspace/ui/components/avatar";
import { ActionButton } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";
import type { schema } from "api/schema";
import { Brain } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { ThreadSummaryHoverCard } from "~/components/chips";
import { RichMarkdown } from "~/components/markdown/rich-markdown";
import { buildThreadParam } from "~/utils/thread";
import { ActionRow } from "./action-row";
import {
  type ActorContext,
  acceptInlineSuggestion,
  acceptThreadRead,
  dismissInlineSuggestion,
  dismissThreadRead,
} from "./handlers";
import { SignalReplyDraftEditor } from "./signal-reply-draft-editor";

export type ThreadWithRelations = InferLiveObject<
  typeof schema.thread,
  {
    author: { include: { user: true } };
    assignedUser: { include: { user: true } };
  }
>;

type Props = {
  thread: ThreadWithRelations & { agentRead: ThreadRead };
  ctx: ActorContext;
};

function ThreadRef({ thread }: { thread: ThreadWithRelations }) {
  return (
    <ThreadSummaryHoverCard thread={thread}>
      <Link
        to="/app/threads/$id"
        params={{ id: buildThreadParam(thread) }}
        className="inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <Avatar
          variant="user"
          size="md"
          fallback={thread.author?.name}
          src={thread.author?.user?.image ?? undefined}
        />
        <span className="text-foreground-primary">{thread.name}</span>
        {thread.shortId != null && (
          <span className="text-foreground-secondary tabular-nums">
            #{thread.shortId}
          </span>
        )}
      </Link>
    </ThreadSummaryHoverCard>
  );
}

type SelectedAction = { action: Action; index: number };

function primaryReplyAction(primary: Action[]): ReplyAction | undefined {
  return primary.find(
    (action): action is ReplyAction => action.kind === "reply",
  );
}

function primaryReplyDraftMarkdown(primary: Action[]): string {
  return primaryReplyAction(primary)?.draftMarkdown ?? "";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Selected bundle actions in display order: reply always leads, the rest keep
 * their original bundle order.
 */
function orderReplyFirst(
  primary: Action[],
  selected: ReadonlySet<number>,
): SelectedAction[] {
  return primary
    .map((action, index): SelectedAction => ({ action, index }))
    .filter(({ index }) => selected.has(index))
    .sort((a, b) => {
      const aReply = a.action.kind === "reply" ? 0 : 1;
      const bReply = b.action.kind === "reply" ? 0 : 1;
      if (aReply !== bReply) return aReply - bReply;
      return a.index - b.index;
    });
}

/**
 * Compose the compound-action button copy from the current selection, e.g.
 * "Reply and close", "Reply and do 2 actions", or — once the reply editor is
 * open — "Send and close". The leading verb becomes "Send" while editing.
 */
function compoundButtonLabel(
  ordered: SelectedAction[],
  replyEditorOpen: boolean,
): string {
  if (ordered.length === 0) return "Select an action";

  const verbAt = (entry: SelectedAction, position: number): string => {
    if (entry.action.kind === "reply" && replyEditorOpen) {
      return position === 0 ? "Send" : "send";
    }
    return ACTION_KIND_VERB[entry.action.kind];
  };

  const first = capitalize(verbAt(ordered[0], 0));
  if (ordered.length === 1) return first;
  if (ordered.length === 2) return `${first} and ${verbAt(ordered[1], 1)}`;
  return `${first} and do ${ordered.length - 1} actions`;
}

type CompoundActionButtonProps = {
  label: string;
  /** Hard-disabled (e.g. busy executing): blocks the trigger entirely. */
  disabled: boolean;
  /**
   * Execution is invalid right now (nothing selected, or empty reply). The
   * click is gated, but for a compound bundle the selector stays reachable so
   * the user can re-select an action and recover.
   */
  executeDisabled: boolean;
  onClick: () => void;
  /** The full bundle to offer for selection, or null for a single action. */
  actions: Action[] | null;
  selectedIndices: ReadonlySet<number>;
  lockedIndex: number;
  disableToggles: boolean;
  onToggle: (index: number) => void;
};

function CompoundActionButton({
  label,
  disabled,
  executeDisabled,
  onClick,
  actions,
  selectedIndices,
  lockedIndex,
  disableToggles,
  onToggle,
}: CompoundActionButtonProps) {
  const fieldId = useId();

  if (!actions) {
    return (
      <ActionButton
        size="sm"
        variant="primary"
        onClick={onClick}
        disabled={disabled || executeDisabled}
      >
        {label}
      </ActionButton>
    );
  }

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <ActionButton
            size="sm"
            variant="primary"
            onClick={executeDisabled ? undefined : onClick}
            disabled={disabled}
            aria-disabled={executeDisabled || undefined}
            className={cn(executeDisabled && "opacity-60")}
          />
        }
      >
        {label}
      </HoverCardTrigger>
      <HoverCardContent
        align="end"
        className="flex w-60 flex-col gap-0.5 p-1.5"
      >
        <p className="px-1.5 py-1 text-xs text-foreground-secondary">
          Actions in this bundle
        </p>
        {actions.map((action, index) => {
          const locked = index === lockedIndex;
          const checkboxId = `${fieldId}-${index}`;
          return (
            <div
              key={`${action.kind}:${index}`}
              className="flex items-center gap-2 rounded-sm px-1.5 py-1 hover:bg-accent has-disabled:opacity-60"
            >
              <Checkbox
                id={checkboxId}
                checked={selectedIndices.has(index)}
                disabled={locked || disableToggles}
                onCheckedChange={() => onToggle(index)}
              />
              <label
                htmlFor={checkboxId}
                className="flex-1 cursor-pointer select-none text-sm text-foreground-primary has-disabled:cursor-default"
              >
                {ACTION_KIND_LABEL[action.kind]}
              </label>
            </div>
          );
        })}
      </HoverCardContent>
    </HoverCard>
  );
}

function inlineSuggestionLabel(suggestion: InlineSuggestion): string {
  if (suggestion.action.kind === "set_status") {
    const status =
      STATUS_LABELS[suggestion.action.status] ?? suggestion.action.status;
    return `Set status: ${status}`;
  }
  return `Apply label (${suggestion.action.labelId})`;
}

function AgentReadReasoningTrigger({ reasoning }: { reasoning: string }) {
  const trimmed = sanitizeAgentReadReasoning(reasoning);
  if (!trimmed) return null;

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <ActionButton
            size="sm"
            variant="ghost"
            tooltip="Agent reasoning"
            aria-label="View agent reasoning"
          />
        }
      >
        <Brain className="size-3.5" />
      </HoverCardTrigger>
      <HoverCardContent className="max-w-96 w-full flex flex-col gap-2">
        <p className="text-xs font-medium text-foreground-primary">Reasoning</p>
        <RichMarkdown
          content={trimmed}
          preset="inline"
          className="text-xs text-foreground-secondary"
        />
      </HoverCardContent>
    </HoverCard>
  );
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes("STALE_AGENT_READ")) {
    return "This signal changed in the background. Refresh and try again.";
  }
  return "Could not apply this signal. Please try again.";
}

export function ThreadReadCard({ thread, ctx }: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [replyEditorOpen, setReplyEditorOpen] = useState(false);
  const read = thread.agentRead;
  const readFingerprint = fingerprintAgentRead(read);
  const replyIndex = read.primary.findIndex(
    (action) => action.kind === "reply",
  );
  const isCompound = read.primary.length > 1;
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    () => new Set(read.primary.map((_, index) => index)),
  );
  const [replyDraft, setReplyDraft] = useState(() =>
    primaryReplyDraftMarkdown(read.primary),
  );
  const [replyEditorRevision, setReplyEditorRevision] = useState(0);
  const inlineSuggestions = (thread.inlineSuggestions ?? []).filter(
    (suggestion) => !suggestion.dismissedAt,
  );

  useEffect(() => {
    setReplyEditorOpen(false);
    setSelectedIndices(new Set(read.primary.map((_, index) => index)));
    setReplyDraft(primaryReplyDraftMarkdown(read.primary));
    setReplyEditorRevision((revision) => revision + 1);
  }, [readFingerprint, read.primary]);

  const orderedSelected = useMemo(
    () => orderReplyFirst(read.primary, selectedIndices),
    [read.primary, selectedIndices],
  );
  const selectionIncludesReply =
    replyIndex >= 0 && selectedIndices.has(replyIndex);

  const handleAcceptSelected = async (replyDraftValue?: string) => {
    const indices = [...selectedIndices].sort((a, b) => a - b);
    if (indices.length === 0) return;
    setBusyKey("primary");
    try {
      await acceptThreadRead({
        threadId: thread.id,
        read,
        selection: { primaryActionIndices: indices },
        ctx,
        replyDraft: replyDraftValue,
      });
      setReplyEditorOpen(false);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  };

  const handlePrimaryClick = () => {
    if (selectionIncludesReply) {
      setReplyEditorOpen(true);
      return;
    }
    void handleAcceptSelected();
  };

  const handleCancelReplyEditor = () => {
    setReplyEditorOpen(false);
    setReplyDraft(primaryReplyDraftMarkdown(read.primary));
    setReplyEditorRevision((revision) => revision + 1);
  };

  const handleSendReply = () => {
    const trimmed = replyDraft.trim();
    if (trimmed.length === 0) return;
    void handleAcceptSelected(trimmed);
  };

  const toggleAction = (index: number) => {
    // Reply stays locked-in while its editor is expanded.
    if (replyEditorOpen && index === replyIndex) return;
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleAcceptAlternative = async (alternativeIndex: number) => {
    setBusyKey(`alt:${alternativeIndex}`);
    try {
      await acceptThreadRead({
        threadId: thread.id,
        read,
        selection: { alternativeIndex },
        ctx,
      });
    } catch (error) {
      toast.error(formatErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  };

  const handleDismissRead = async () => {
    setBusyKey("dismiss");
    try {
      await dismissThreadRead({
        threadId: thread.id,
        read,
        ctx,
      });
    } catch (error) {
      toast.error(formatErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  };

  const handleInlineAccept = async (suggestion: InlineSuggestion) => {
    setBusyKey(`inline:accept:${suggestion.id}`);
    try {
      await acceptInlineSuggestion({
        threadId: thread.id,
        suggestion,
        ctx,
      });
    } catch {
      toast.error("Could not apply this inline suggestion.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleInlineDismiss = async (suggestion: InlineSuggestion) => {
    setBusyKey(`inline:dismiss:${suggestion.id}`);
    try {
      await dismissInlineSuggestion({
        threadId: thread.id,
        suggestion,
        ctx,
      });
    } catch {
      toast.error("Could not dismiss this inline suggestion.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <ActionRow.Root tier={urgencyTierFromScore(read.urgencyScore)}>
      <ActionRow.Header>
        <ActionRow.Title>
          <ThreadRef thread={thread} />
          {read.createdAt ? (
            <ActionRow.Meta>
              {formatRelativeTime(new Date(read.createdAt))}
            </ActionRow.Meta>
          ) : null}
        </ActionRow.Title>
        <ActionRow.Reason>
          <RichMarkdown
            content={read.summary}
            preset="inline"
            className="text-foreground-primary"
          />
        </ActionRow.Reason>
        {inlineSuggestions.length > 0 && (
          <div className="pl-6 mt-2 flex flex-col gap-2">
            {inlineSuggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="flex items-center justify-between gap-2 rounded-sm border bg-background-tertiary px-2 py-1"
              >
                <span className="text-xs text-foreground-secondary">
                  {inlineSuggestionLabel(suggestion)}
                </span>
                <div className="flex items-center gap-2">
                  <ActionButton
                    size="sm"
                    variant="ghost"
                    onClick={() => handleInlineDismiss(suggestion)}
                    disabled={busyKey !== null}
                  >
                    Skip
                  </ActionButton>
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    onClick={() => handleInlineAccept(suggestion)}
                    disabled={busyKey !== null}
                  >
                    Apply
                  </ActionButton>
                </div>
              </div>
            ))}
          </div>
        )}
        <ActionRow.TopActions>
          <AgentReadReasoningTrigger reasoning={read.reasoning} />
          <ActionRow.Dismiss onClick={handleDismissRead} label="Dismiss read" />
        </ActionRow.TopActions>
      </ActionRow.Header>
      <SignalReplyDraftEditor
        open={replyEditorOpen}
        draft={replyDraft}
        contentKey={`${readFingerprint}:${replyEditorRevision}`}
        onDraftChange={setReplyDraft}
      />
      <ActionRow.Actions>
        {(read.alternatives ?? []).map((alternative, index) => (
          <ActionButton
            key={`${thread.id}:alternative:${alternative.kind}:${index}`}
            size="sm"
            variant="secondary"
            onClick={() => handleAcceptAlternative(index)}
            disabled={busyKey !== null}
          >
            {ACTION_KIND_LABEL[alternative.kind]}
          </ActionButton>
        ))}
        {replyEditorOpen && (
          <ActionButton
            size="sm"
            variant="ghost"
            onClick={handleCancelReplyEditor}
            disabled={busyKey !== null}
          >
            Cancel
          </ActionButton>
        )}
        {read.primary.length > 0 && (
          <CompoundActionButton
            label={compoundButtonLabel(orderedSelected, replyEditorOpen)}
            disabled={busyKey !== null}
            executeDisabled={
              orderedSelected.length === 0 ||
              (replyEditorOpen && replyDraft.trim().length === 0)
            }
            onClick={replyEditorOpen ? handleSendReply : handlePrimaryClick}
            actions={isCompound ? read.primary : null}
            selectedIndices={selectedIndices}
            lockedIndex={replyEditorOpen ? replyIndex : -1}
            disableToggles={busyKey !== null}
            onToggle={toggleAction}
          />
        )}
      </ActionRow.Actions>
    </ActionRow.Root>
  );
}
