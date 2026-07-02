import type { InferLiveObject } from "@live-state/sync";
import { useLiveQuery } from "@live-state/sync/client";
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
import { StatusIndicator } from "@workspace/ui/components/indicator";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";
import type { schema } from "api/schema";
import { Brain, Check, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { ThreadSummaryHoverCard } from "~/components/chips";
import { RichMarkdown } from "~/components/markdown/rich-markdown";
import { query } from "~/lib/live-state";
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

type ResolvedInlineSuggestion =
  | {
      suggestion: InlineSuggestion;
      kind: "status";
      name: string;
      status: number;
    }
  | {
      suggestion: InlineSuggestion;
      kind: "label";
      name: string;
      color: string;
    };

/**
 * Inline-track suggestions (apply label / set status) rendered as dashed chips,
 * mirroring the thread toolbar's quick-actions style: click a chip to apply,
 * hover for detail, and reveal apply-all / ignore-all on row hover.
 */
function InlineSuggestionsRow({
  suggestions,
  organizationId,
  busy,
  onAccept,
  onDismiss,
}: {
  suggestions: InlineSuggestion[];
  organizationId: string;
  busy: boolean;
  onAccept: (suggestion: InlineSuggestion) => void;
  onDismiss: (suggestion: InlineSuggestion) => void;
}) {
  const labels = useLiveQuery(
    query.label.where({ organizationId, enabled: true }),
  );

  const resolved = useMemo<ResolvedInlineSuggestion[]>(() => {
    const labelById = new Map((labels ?? []).map((label) => [label.id, label]));
    const result: ResolvedInlineSuggestion[] = [];
    for (const suggestion of suggestions) {
      if (suggestion.action.kind === "set_status") {
        const status = suggestion.action.status;
        result.push({
          suggestion,
          kind: "status",
          name: STATUS_LABELS[status] ?? `Status ${status}`,
          status,
        });
      } else {
        const label = labelById.get(suggestion.action.labelId);
        if (!label) continue;
        result.push({
          suggestion,
          kind: "label",
          name: label.name,
          color: label.color,
        });
      }
    }
    return result;
  }, [labels, suggestions]);

  if (resolved.length === 0) return null;

  const chipContent = (item: ResolvedInlineSuggestion) => (
    <>
      {item.kind === "status" ? (
        <StatusIndicator status={item.status} />
      ) : (
        <div
          className="size-2 rounded-full"
          style={{ backgroundColor: item.color }}
        />
      )}
      {item.name}
    </>
  );

  return (
    <div className="pl-6 mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 items-center text-sm">
      <div className="text-foreground-secondary">Quick suggestions</div>
      <div className="flex gap-2 items-center flex-wrap group">
        {resolved.map((item) => (
          <HoverCard key={item.suggestion.id}>
            <HoverCardTrigger
              render={
                <ActionButton
                  variant="ghost"
                  size="sm"
                  className="border border-dashed border-input dark:hover:bg-foreground-tertiary/15"
                  onClick={() => onAccept(item.suggestion)}
                  disabled={busy}
                />
              }
            >
              {chipContent(item)}
            </HoverCardTrigger>
            <HoverCardContent className="min-w-72 w-full max-w-96 flex flex-col gap-3">
              <div className="text-xs flex flex-col gap-1">
                <div className="text-foreground-secondary">
                  {item.kind === "status"
                    ? "Suggested status"
                    : "Suggested label"}
                </div>
                <div className="border border-dashed flex items-center w-fit h-6 rounded-sm gap-1.5 px-2 has-[>svg:first-child]:pl-1.5 text-xs bg-foreground-tertiary/15">
                  {chipContent(item)}
                </div>
              </div>
              <ActionButton
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => onAccept(item.suggestion)}
                disabled={busy}
              >
                Apply suggestion
              </ActionButton>
            </HoverCardContent>
          </HoverCard>
        ))}
        <div className="flex items-center gap-0 opacity-0 transition-opacity pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto">
          <ActionButton
            variant="ghost"
            size="icon-sm"
            tooltip="Apply all"
            className="text-foreground-secondary"
            onClick={() =>
              resolved.forEach((item) => onAccept(item.suggestion))
            }
            disabled={busy}
          >
            <Check />
          </ActionButton>
          <ActionButton
            variant="ghost"
            size="icon-sm"
            tooltip="Ignore all"
            className="text-foreground-secondary"
            onClick={() =>
              resolved.forEach((item) => onDismiss(item.suggestion))
            }
            disabled={busy}
          >
            <X />
          </ActionButton>
        </div>
      </div>
    </div>
  );
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
  // Which reply is being previewed/edited: the primary bundle's reply, or a
  // specific alternative reply. Both open the same inline draft editor.
  const [replyTarget, setReplyTarget] = useState<
    { kind: "primary" } | { kind: "alternative"; index: number } | null
  >(null);
  const replyEditorOpen = replyTarget !== null;
  const editingPrimaryReply = replyTarget?.kind === "primary";
  const editingAlternativeReply = replyTarget?.kind === "alternative";
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
    setReplyTarget(null);
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
      setReplyTarget(null);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  };

  const handlePrimaryClick = () => {
    if (selectionIncludesReply) {
      setReplyTarget({ kind: "primary" });
      return;
    }
    void handleAcceptSelected();
  };

  const handleCancelReplyEditor = () => {
    setReplyTarget(null);
    setReplyDraft(primaryReplyDraftMarkdown(read.primary));
    setReplyEditorRevision((revision) => revision + 1);
  };

  const handleSendReply = () => {
    const trimmed = replyDraft.trim();
    if (trimmed.length === 0) return;
    if (replyTarget?.kind === "alternative") {
      void handleAcceptAlternative(replyTarget.index, trimmed);
      return;
    }
    void handleAcceptSelected(trimmed);
  };

  const toggleAction = (index: number) => {
    // The primary reply stays locked-in while its editor is expanded.
    if (editingPrimaryReply && index === replyIndex) return;
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleAcceptAlternative = async (
    alternativeIndex: number,
    replyDraftValue?: string,
  ) => {
    setBusyKey(`alt:${alternativeIndex}`);
    try {
      await acceptThreadRead({
        threadId: thread.id,
        read,
        selection: { alternativeIndex },
        ctx,
        replyDraft: replyDraftValue,
      });
      setReplyTarget(null);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  };

  // A reply alternative opens the same inline preview editor as the primary
  // reply (seeded with its own draft); any other alternative applies directly.
  const handleAlternativeClick = (alternativeIndex: number) => {
    const alternative = read.alternatives?.[alternativeIndex];
    if (alternative?.kind === "reply") {
      setReplyTarget({ kind: "alternative", index: alternativeIndex });
      setReplyDraft(alternative.draftMarkdown ?? "");
      setReplyEditorRevision((revision) => revision + 1);
      return;
    }
    void handleAcceptAlternative(alternativeIndex);
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
          <InlineSuggestionsRow
            suggestions={inlineSuggestions}
            organizationId={ctx.organizationId}
            busy={busyKey !== null}
            onAccept={handleInlineAccept}
            onDismiss={handleInlineDismiss}
          />
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
        {!editingAlternativeReply &&
          (read.alternatives ?? []).map((alternative, index) => (
            <ActionButton
              key={`${thread.id}:alternative:${alternative.kind}:${index}`}
              size="sm"
              variant="secondary"
              onClick={() => handleAlternativeClick(index)}
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
        {editingAlternativeReply ? (
          <ActionButton
            size="sm"
            variant="primary"
            onClick={handleSendReply}
            disabled={busyKey !== null || replyDraft.trim().length === 0}
          >
            Send reply
          </ActionButton>
        ) : (
          read.primary.length > 0 && (
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
              lockedIndex={editingPrimaryReply ? replyIndex : -1}
              disableToggles={busyKey !== null}
              onToggle={toggleAction}
            />
          )
        )}
      </ActionRow.Actions>
    </ActionRow.Root>
  );
}
