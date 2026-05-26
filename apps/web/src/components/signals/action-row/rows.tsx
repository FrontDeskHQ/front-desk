import type { InferLiveObject } from "@live-state/sync";
import { Link } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { ActionButton } from "@workspace/ui/components/button";
import { statusValues } from "@workspace/ui/components/indicator";
import type { schema } from "api/schema";
import { Check, ExternalLink } from "lucide-react";
import { z } from "zod";
import { ThreadSummaryHoverCard } from "~/components/chips";
import { RichMarkdown } from "~/components/markdown/rich-markdown";
import { buildThreadParam } from "~/utils/thread";
import { ActionRow, type UrgencyTier } from "./action-row";
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

// Local copies of the legacy `urgencyTierFromScore` + `SIGNAL_LABEL` surface —
// the signals overhaul deletes both from @workspace/schemas/signals. Issue 10
// rewrites this whole feed surface against the new ThreadRead schema.
type LegacySignalType =
  | "label"
  | "duplicate"
  | "linked_pr"
  | "pending_reply"
  | "loop_to_close"
  | "suggested_reply"
  | "status"
  | "churn_risk"
  | "kb_gap"
  | "trending_issue";

const SIGNAL_LABEL: Record<LegacySignalType, string> = {
  churn_risk: "Churn risk",
  pending_reply: "Awaiting your reply",
  duplicate: "Likely duplicate",
  loop_to_close: "Notify customer",
  linked_pr: "Matching PR",
  status: "Suggested status",
  kb_gap: "Knowledge gap",
  trending_issue: "Trending issue",
  suggested_reply: "Suggested reply",
  label: "Suggested label",
};

function tierFor(score: number): UrgencyTier {
  if (score >= 80) return "red";
  if (score >= 50) return "orange";
  return "yellow";
}

function TitleLabel({ type }: { type: LegacySignalType }) {
  return <span>{SIGNAL_LABEL[type]}</span>;
}

function ThreadRef({ thread }: { thread: ThreadWithRels | undefined }) {
  if (!thread) return null;
  return (
    <ThreadSummaryHoverCard thread={thread}>
      <Link
        to="/app/threads/$id"
        params={{ id: buildThreadParam(thread) }}
        className="inline-flex items-center w-fit gap-1.5 text-sm"
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
      <ActionRow.Header>
        <ActionRow.Title>
          <ThreadRef thread={thread} />
        </ActionRow.Title>
        <ActionRow.Reason>
          <TitleLabel type="status" />
        </ActionRow.Reason>
        <ActionRow.Dismiss
          onClick={() => dismissStatusSuggestion(suggestion, ctx)}
        />
      </ActionRow.Header>
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
      <ActionRow.Header>
        <ActionRow.Title>
          <ThreadRef thread={thread} />
        </ActionRow.Title>
        <ActionRow.Reason>
          {thread && target ? (
            <span className="inline-flex items-center gap-1.5">
              <span>is a duplicate of</span>
              <ThreadRef thread={target} />
            </span>
          ) : (
            parsed.reason
          )}
        </ActionRow.Reason>
        <ActionRow.Dismiss
          label="Skip"
          onClick={() => dismissDuplicateSuggestion(parsed, ctx)}
        />
      </ActionRow.Header>
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
      <ActionRow.Header>
        <ActionRow.Title>
          <ThreadRef thread={thread} />
        </ActionRow.Title>
        <ActionRow.Reason>
          <span className="inline-flex items-center gap-1.5">
            <TitleLabel type="linked_pr" />
            <a
              href={parsed.prUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              {parsed.repo}#{parsed.prNumber}
              <ExternalLink className="size-3" />
            </a>
          </span>
        </ActionRow.Reason>
        <ActionRow.Dismiss
          onClick={() => dismissLinkedPrSuggestion(parsed, ctx)}
        />
      </ActionRow.Header>
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
      <ActionRow.Header>
        <ActionRow.Title>
          <ThreadRef thread={thread} />
        </ActionRow.Title>
        <ActionRow.Reason>
          <TitleLabel type="pending_reply" />
        </ActionRow.Reason>
        <ActionRow.Dismiss
          onClick={() =>
            dismissDigestSuggestion(suggestion, "digest:pending_reply", ctx)
          }
        />
      </ActionRow.Header>
      <ActionRow.Actions>
        {thread && <OpenThreadButton thread={thread} label="Open" />}
      </ActionRow.Actions>
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
      <ActionRow.Header>
        <ActionRow.Title>
          <ThreadRef thread={thread} />
        </ActionRow.Title>
        <ActionRow.Reason>
          {suggestion.summary ? (
            <RichMarkdown content={suggestion.summary} preset="inline" />
          ) : (
            <TitleLabel type="loop_to_close" />
          )}
        </ActionRow.Reason>
        <ActionRow.Dismiss
          onClick={() =>
            dismissDigestSuggestion(suggestion, "digest:loop_to_close", ctx)
          }
        />
      </ActionRow.Header>
      <ActionRow.Actions>
        {thread && <OpenThreadButton thread={thread} label="Notify" />}
      </ActionRow.Actions>
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
  const parsed = pendingReplyResultSchema.safeParse(
    safeJsonParse(s.resultsStr),
  );
  if (!parsed.success) return null;
  return { ...s, ...parsed.data };
}

function parseLoopToClose(s: SuggestionRow) {
  if (!s.resultsStr) return null;
  const parsed = loopToCloseResultSchema.safeParse(safeJsonParse(s.resultsStr));
  if (!parsed.success) return null;
  return { ...s, ...parsed.data };
}

const PARSER_FOR_TYPE: Record<string, (s: SuggestionRow) => unknown | null> = {
  status: parseStatus,
  duplicate: parseDuplicate,
  linked_pr: parseLinkedPr,
  "digest:pending_reply": parsePendingReply,
  "digest:loop_to_close": parseLoopToClose,
};

export function canRenderSuggestion(s: SuggestionRow): boolean {
  const parser = PARSER_FOR_TYPE[s.type];
  return parser ? parser(s) !== null : false;
}
