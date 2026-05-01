import type { InferLiveObject } from "@live-state/sync";
import { Link } from "@tanstack/react-router";
import {
  SIGNAL_LABEL,
  type SignalType,
  urgencyTierFromScore,
} from "@workspace/schemas/signals";
import { ActionButton } from "@workspace/ui/components/button";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import type { schema } from "api/schema";
import { Check, ExternalLink } from "lucide-react";
import { ThreadChip } from "~/components/chips";
import { buildThreadParam } from "~/utils/thread";
import { ActionRow } from "./action-row";
import {
  type ActorContext,
  acceptDuplicateSuggestion,
  acceptLinkedPrSuggestion,
  acceptStatusSuggestion,
  dismissDigestSuggestion,
  dismissDuplicateSuggestion,
  dismissLinkedPrSuggestion,
  dismissStatusSuggestion,
  type SuggestionRow,
} from "./handlers";

type ThreadWithRels = InferLiveObject<
  typeof schema.thread,
  {
    author: { include: { user: true } };
    assignedUser: { include: { user: true } };
  }
>;

export type SignalRowProps = {
  suggestion: SuggestionRow;
  threadsMap: Map<string, ThreadWithRels>;
  ctx: ActorContext;
};

function tierFor(score: number) {
  return urgencyTierFromScore(score);
}

function TitleLabel({ type }: { type: SignalType }) {
  return <span>{SIGNAL_LABEL[type]}</span>;
}

function ThreadRef({ thread }: { thread: ThreadWithRels | undefined }) {
  if (!thread) return null;
  return (
    <Link to="/app/threads/$id" params={{ id: buildThreadParam(thread) }}>
      <ThreadChip thread={thread} />
    </Link>
  );
}

function OpenThreadButton({
  thread,
  label,
}: {
  thread: ThreadWithRels;
  label: string;
}) {
  return (
    <Link
      to="/app/threads/$id"
      params={{ id: buildThreadParam(thread) }}
    >
      <ActionButton size="sm" variant="primary">
        {label}
      </ActionButton>
    </Link>
  );
}

export function StatusActionRow({
  suggestion,
  threadsMap,
  ctx,
}: SignalRowProps) {
  const parsed = parseStatus(suggestion);
  if (!parsed) return null;
  const thread = threadsMap.get(suggestion.entityId);
  return (
    <ActionRow.Root tier={tierFor(suggestion.urgencyScore)}>
      <ActionRow.Title>
        <TitleLabel type="status" />
        <ActionRow.Meta>
          {formatRelativeTime(suggestion.createdAt)}
        </ActionRow.Meta>
      </ActionRow.Title>
      <ActionRow.Reason>
        <ThreadRef thread={thread} />
      </ActionRow.Reason>
      <ActionRow.Actions>
        <ActionButton
          size="sm"
          variant="primary"
          tooltip="Apply"
          onClick={() => acceptStatusSuggestion(parsed, thread, ctx)}
        >
          <Check className="size-3.5" /> Apply
        </ActionButton>
      </ActionRow.Actions>
      <ActionRow.Dismiss
        onClick={() => dismissStatusSuggestion(suggestion, ctx)}
      />
    </ActionRow.Root>
  );
}

export function DuplicateActionRow({
  suggestion,
  threadsMap,
  ctx,
}: SignalRowProps) {
  const parsed = parseDuplicate(suggestion);
  if (!parsed) return null;
  const thread = threadsMap.get(suggestion.entityId);
  const target = threadsMap.get(parsed.targetThreadId);
  const pct = Math.round(parsed.score * 100);
  return (
    <ActionRow.Root tier={tierFor(suggestion.urgencyScore)}>
      <ActionRow.Title>
        <TitleLabel type="duplicate" />
        <ActionRow.Meta>{pct}% match</ActionRow.Meta>
      </ActionRow.Title>
      <ActionRow.Reason>
        {thread ? (
          <span className="inline-flex items-center gap-1.5">
            <ThreadRef thread={thread} />
            <span>is a duplicate of</span>
            <ThreadRef thread={target} />
          </span>
        ) : (
          parsed.reason
        )}
      </ActionRow.Reason>
      <ActionRow.Actions>
        <ActionButton
          size="sm"
          variant="primary"
          tooltip="Mark as duplicate"
          onClick={() => acceptDuplicateSuggestion(parsed, thread, target, ctx)}
        >
          Link
        </ActionButton>
      </ActionRow.Actions>
      <ActionRow.Dismiss
        label="Skip"
        onClick={() => dismissDuplicateSuggestion(parsed, ctx)}
      />
    </ActionRow.Root>
  );
}

export function LinkedPrActionRow({
  suggestion,
  threadsMap,
  ctx,
}: SignalRowProps) {
  const parsed = parseLinkedPr(suggestion);
  if (!parsed) return null;
  const thread = threadsMap.get(suggestion.entityId);
  return (
    <ActionRow.Root tier={tierFor(suggestion.urgencyScore)}>
      <ActionRow.Title>
        <TitleLabel type="linked_pr" />
        <ActionRow.Meta>
          <a
            href={parsed.prUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
          >
            {parsed.repo}#{parsed.prNumber}
            <ExternalLink className="size-3" />
          </a>
        </ActionRow.Meta>
      </ActionRow.Title>
      <ActionRow.Reason>
        <ThreadRef thread={thread} />
      </ActionRow.Reason>
      <ActionRow.Actions>
        <ActionButton
          size="sm"
          variant="primary"
          tooltip="Link PR to thread"
          onClick={() => acceptLinkedPrSuggestion(parsed, thread, ctx)}
        >
          Link PR
        </ActionButton>
      </ActionRow.Actions>
      <ActionRow.Dismiss
        onClick={() => dismissLinkedPrSuggestion(parsed, ctx)}
      />
    </ActionRow.Root>
  );
}

export function PendingReplyActionRow({
  suggestion,
  threadsMap,
  ctx,
}: SignalRowProps) {
  const parsed = parsePendingReply(suggestion);
  if (!parsed) return null;
  const thread = threadsMap.get(suggestion.entityId);
  return (
    <ActionRow.Root tier={tierFor(suggestion.urgencyScore)}>
      <ActionRow.Title>
        <TitleLabel type="pending_reply" />
        <ActionRow.Meta>
          {formatRelativeTime(new Date(parsed.lastMessageAt))}
        </ActionRow.Meta>
      </ActionRow.Title>
      <ActionRow.Reason>
        <ThreadRef thread={thread} />
      </ActionRow.Reason>
      <ActionRow.Actions>
        {thread && <OpenThreadButton thread={thread} label="Open" />}
      </ActionRow.Actions>
      <ActionRow.Dismiss
        onClick={() =>
          dismissDigestSuggestion(suggestion, "digest:pending_reply", ctx)
        }
      />
    </ActionRow.Root>
  );
}

export function LoopToCloseActionRow({
  suggestion,
  threadsMap,
  ctx,
}: SignalRowProps) {
  const parsed = parseLoopToClose(suggestion);
  if (!parsed) return null;
  const thread = threadsMap.get(suggestion.entityId);
  return (
    <ActionRow.Root tier={tierFor(suggestion.urgencyScore)}>
      <ActionRow.Title>
        <TitleLabel type="loop_to_close" />
        <ActionRow.Meta>PR shipped</ActionRow.Meta>
      </ActionRow.Title>
      <ActionRow.Reason>
        <ThreadRef thread={thread} />
      </ActionRow.Reason>
      <ActionRow.Actions>
        {thread && <OpenThreadButton thread={thread} label="Notify" />}
      </ActionRow.Actions>
      <ActionRow.Dismiss
        onClick={() =>
          dismissDigestSuggestion(suggestion, "digest:loop_to_close", ctx)
        }
      />
    </ActionRow.Root>
  );
}

// --- Parsers ---

function parseStatus(s: SuggestionRow) {
  if (!s.resultsStr) return null;
  try {
    const r = JSON.parse(s.resultsStr) as { suggestedStatus: number };
    if (typeof r.suggestedStatus !== "number") return null;
    return { ...s, suggestedStatus: r.suggestedStatus };
  } catch {
    return null;
  }
}

function parseDuplicate(s: SuggestionRow) {
  if (!s.resultsStr || !s.relatedEntityId) return null;
  try {
    const r = JSON.parse(s.resultsStr) as {
      confidence: string;
      reason: string;
      score: number;
    };
    return {
      ...s,
      targetThreadId: s.relatedEntityId,
      confidence: r.confidence,
      reason: r.reason,
      score: r.score,
    };
  } catch {
    return null;
  }
}

function parseLinkedPr(s: SuggestionRow) {
  if (!s.resultsStr) return null;
  try {
    const r = JSON.parse(s.resultsStr) as {
      prId: number;
      prNumber: number;
      prTitle: string;
      prUrl: string;
      repo: string;
      confidence: number;
      reasoning: string;
    };
    if (!r.prId) return null;
    return { ...s, ...r };
  } catch {
    return null;
  }
}

function parsePendingReply(s: SuggestionRow) {
  if (!s.resultsStr) return null;
  try {
    const r = JSON.parse(s.resultsStr) as {
      lastMessageAt: string;
      thresholdMinutes: number;
    };
    if (!r.lastMessageAt) return null;
    return { ...s, ...r };
  } catch {
    return null;
  }
}

function parseLoopToClose(s: SuggestionRow) {
  if (!s.resultsStr) return null;
  try {
    const r = JSON.parse(s.resultsStr) as {
      linkedPrId: string;
      prMergedAt: string;
    };
    if (!r.linkedPrId || !r.prMergedAt) return null;
    return { ...s, ...r };
  } catch {
    return null;
  }
}
