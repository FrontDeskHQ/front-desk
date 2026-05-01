import type { InferLiveObject } from "@live-state/sync";
import { Link } from "@tanstack/react-router";
import {
  SIGNAL_LABEL,
  type SignalType,
  urgencyTierFromScore,
} from "@workspace/schemas/signals";
import { ActionButton } from "@workspace/ui/components/button";
import { statusValues } from "@workspace/ui/components/indicator";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import type { schema } from "api/schema";
import { Check, ExternalLink } from "lucide-react";
import { z } from "zod";
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
    <ActionButton
      size="sm"
      variant="primary"
      render={
        <Link to="/app/threads/$id" params={{ id: buildThreadParam(thread) }} />
      }
    >
      {label}
    </ActionButton>
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
        {thread && target ? (
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

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const statusResultSchema = z.object({
  suggestedStatus: z
    .number()
    .int()
    .refine((v) => statusValues[v] != null, "Unsupported suggested status"),
});

const duplicateResultSchema = z.object({
  confidence: z.string(),
  reason: z.string(),
  score: z.number(),
});

const linkedPrResultSchema = z.object({
  prId: z.number(),
  prNumber: z.number(),
  prTitle: z.string(),
  prUrl: z.string(),
  repo: z.string(),
  confidence: z.number(),
  reasoning: z.string(),
});

const pendingReplyResultSchema = z.object({
  lastMessageAt: z.string().min(1),
  thresholdMinutes: z.number(),
});

const loopToCloseResultSchema = z.object({
  linkedPrId: z.string().min(1),
  prMergedAt: z.string().min(1),
});

function parseStatus(s: SuggestionRow) {
  if (!s.resultsStr) return null;
  const parsed = statusResultSchema.safeParse(safeJsonParse(s.resultsStr));
  if (!parsed.success) return null;
  return { ...s, ...parsed.data };
}

function parseDuplicate(s: SuggestionRow) {
  if (!s.resultsStr || !s.relatedEntityId) return null;
  const parsed = duplicateResultSchema.safeParse(safeJsonParse(s.resultsStr));
  if (!parsed.success) return null;
  return { ...s, targetThreadId: s.relatedEntityId, ...parsed.data };
}

function parseLinkedPr(s: SuggestionRow) {
  if (!s.resultsStr) return null;
  const parsed = linkedPrResultSchema.safeParse(safeJsonParse(s.resultsStr));
  if (!parsed.success) return null;
  return { ...s, ...parsed.data };
}

function parsePendingReply(s: SuggestionRow) {
  if (!s.resultsStr) return null;
  const parsed = pendingReplyResultSchema.safeParse(safeJsonParse(s.resultsStr));
  if (!parsed.success) return null;
  return { ...s, ...parsed.data };
}

function parseLoopToClose(s: SuggestionRow) {
  if (!s.resultsStr) return null;
  const parsed = loopToCloseResultSchema.safeParse(safeJsonParse(s.resultsStr));
  if (!parsed.success) return null;
  return { ...s, ...parsed.data };
}
