import { useLiveQuery } from "@live-state/sync/client";
import {
  ACTION_KIND_LABEL,
  sanitizeAgentReadReasoning,
  urgencyTierFromScore,
} from "@workspace/schemas/signals";
import type { Action, InlineSuggestion } from "@workspace/schemas/signals";
import { ActionButton } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";
import { Brain, Check, X } from "lucide-react";
import { useId, useMemo } from "react";
import type { ReactNode } from "react";

import { RichMarkdown } from "~/components/markdown/rich-markdown";
import { query } from "~/lib/live-state";

import { ActionRow } from "../action-row";
import { SignalReplyDraftEditor } from "../signal-reply-draft-editor";
import { useThreadRead } from "./context";
import { compoundButtonLabel } from "./helpers";

interface CompoundActionButtonProps {
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
}

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

interface ResolvedInlineSuggestion {
  suggestion: InlineSuggestion;
  name: string;
  color: string;
}

/**
 * Label suggestions rendered as dashed chips,
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
  onAccept: (suggestion: InlineSuggestion) => void | Promise<void>;
  onDismiss: (suggestion: InlineSuggestion) => void | Promise<void>;
}) {
  const labels = useLiveQuery(query.label.where({ organizationId }));

  const resolved = useMemo<ResolvedInlineSuggestion[]>(() => {
    const labelById = new Map((labels ?? []).map((label) => [label.id, label]));
    const result: ResolvedInlineSuggestion[] = [];
    for (const suggestion of suggestions) {
      const label = labelById.get(suggestion.action.labelId);
      if (!label) {
        // Keep the suggestion dismissible even when its label was deleted,
        // disabled, or hasn't loaded yet — otherwise it becomes a stuck row.
        result.push({
          color: "var(--muted-foreground)",
          name: "Unknown label",
          suggestion,
        });
        continue;
      }
      result.push({
        color: label.color,
        name: label.name,
        suggestion,
      });
    }
    return result;
  }, [labels, suggestions]);

  if (resolved.length === 0) {
    return null;
  }

  const chipContent = (item: ResolvedInlineSuggestion) => (
    <>
      <div
        className="size-2 rounded-full"
        style={{ backgroundColor: item.color }}
      />
      {item.name}
    </>
  );

  return (
    <div className="group flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span className="shrink-0 text-foreground-secondary">
        Quick suggestions
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
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
                <div className="text-foreground-secondary">Suggested label</div>
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
        <div className="flex items-center gap-0 opacity-0 transition-opacity pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto">
          <ActionButton
            variant="ghost"
            size="icon-sm"
            tooltip="Apply all"
            className="text-foreground-secondary"
            onClick={async () => {
              // Run sequentially so a single busy state covers the whole batch
              // instead of concurrent requests racing to clear it.
              for (const item of resolved) {
                await onAccept(item.suggestion);
              }
            }}
            disabled={busy}
          >
            <Check />
          </ActionButton>
          <ActionButton
            variant="ghost"
            size="icon-sm"
            tooltip="Ignore all"
            className="text-foreground-secondary"
            onClick={async () => {
              for (const item of resolved) {
                await onDismiss(item.suggestion);
              }
            }}
            disabled={busy}
          >
            <X />
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function Root({ children }: { children: ReactNode }) {
  const { state } = useThreadRead();
  return (
    <ActionRow.Root tier={urgencyTierFromScore(state.read.urgencyScore)}>
      {children}
    </ActionRow.Root>
  );
}

function Summary() {
  const { state } = useThreadRead();
  return (
    <RichMarkdown
      content={state.read.summary}
      preset="inline"
      className={
        state.read.recommendation
          ? "text-foreground-secondary"
          : "text-foreground-primary"
      }
    />
  );
}

function Recommendation() {
  const { state } = useThreadRead();
  if (!state.read.recommendation) {
    return null;
  }
  return (
    <RichMarkdown
      content={state.read.recommendation}
      preset="inline"
      className="text-foreground-primary"
    />
  );
}

function InlineSuggestions({ className }: { className: string }) {
  const { state, actions, meta } = useThreadRead();
  if (state.inlineSuggestions.length === 0) {
    return null;
  }
  return (
    <div className={className}>
      <InlineSuggestionsRow
        suggestions={state.inlineSuggestions}
        organizationId={meta.ctx.organizationId}
        busy={state.busyKey !== null}
        onAccept={actions.handleInlineAccept}
        onDismiss={actions.handleInlineDismiss}
      />
    </div>
  );
}

function Reasoning() {
  const { state } = useThreadRead();
  const trimmed = sanitizeAgentReadReasoning(state.read.reasoning);
  if (!trimmed) {
    return null;
  }

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

function Timestamp() {
  const { state } = useThreadRead();
  if (!state.read.createdAt) {
    return null;
  }
  return (
    <ActionRow.Meta>
      {formatRelativeTime(new Date(state.read.createdAt))}
    </ActionRow.Meta>
  );
}

function ReplyEditor() {
  const { state, actions } = useThreadRead();
  return (
    <SignalReplyDraftEditor
      open={state.replyEditorOpen}
      draft={state.replyDraft}
      contentKey={`${state.readFingerprint}:${state.replyEditorRevision}`}
      onDraftChange={actions.handleDraftChange}
    />
  );
}

function FooterActions() {
  const { state, actions } = useThreadRead();
  return (
    <>
      {!state.replyEditorOpen &&
        state.visibleAlternatives.map(({ alternative, index }) => (
          <ActionButton
            key={`${state.thread.id}:alternative:${alternative.kind}:${index}`}
            size="sm"
            variant="secondary"
            onClick={() => actions.handleAlternativeClick(index)}
            disabled={state.busyKey !== null}
          >
            {ACTION_KIND_LABEL[alternative.kind]}
          </ActionButton>
        ))}
      {state.replyEditorOpen && (
        <ActionButton
          size="sm"
          variant="ghost"
          onClick={actions.handleCancelReplyEditor}
          disabled={state.busyKey !== null}
        >
          Cancel
        </ActionButton>
      )}
      {state.editingAlternativeReply ? (
        <ActionButton
          size="sm"
          variant="primary"
          onClick={actions.handleSendReply}
          disabled={
            state.busyKey !== null || state.replyDraft.trim().length === 0
          }
        >
          Just reply
        </ActionButton>
      ) : (
        state.read.primary.length > 0 && (
          <CompoundActionButton
            label={compoundButtonLabel(
              state.orderedSelected,
              state.replyEditorOpen
            )}
            disabled={state.busyKey !== null}
            executeDisabled={
              state.orderedSelected.length === 0 ||
              (state.replyEditorOpen && state.replyDraft.trim().length === 0)
            }
            onClick={
              state.replyEditorOpen
                ? actions.handleSendReply
                : actions.handlePrimaryClick
            }
            actions={state.isCompound ? state.read.primary : null}
            selectedIndices={state.selectedIndices}
            lockedIndex={state.editingPrimaryReply ? state.replyIndex : -1}
            disableToggles={state.busyKey !== null}
            onToggle={actions.handleToggleAction}
          />
        )
      )}
    </>
  );
}

function DismissRead() {
  const { state, actions } = useThreadRead();
  return (
    <ActionButton
      size="sm"
      variant="ghost"
      onClick={actions.handleDismissRead}
      disabled={state.busyKey !== null}
    >
      Dismiss
    </ActionButton>
  );
}

function DismissFeed() {
  const { actions } = useThreadRead();
  return (
    <ActionRow.Dismiss
      onClick={actions.handleDismissRead}
      label="Dismiss read"
    />
  );
}

/**
 * Thread-surface header chrome: summary stack on the left, trailing controls
 * on the right. Presentational so the marketing mock can compose the same
 * layout without the live provider.
 */
function SurfaceHeader({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
      <div className="flex shrink-0 items-center gap-0.5">{trailing}</div>
    </div>
  );
}

export const ThreadRead = {
  DismissFeed,
  DismissRead,
  FooterActions,
  InlineSuggestions,
  Recommendation,
  Reasoning,
  ReplyEditor,
  Root,
  Summary,
  SurfaceHeader,
  Timestamp,
};
