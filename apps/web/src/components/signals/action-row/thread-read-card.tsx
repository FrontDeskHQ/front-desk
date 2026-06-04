import type { InferLiveObject } from "@live-state/sync";
import { Link } from "@tanstack/react-router";
import {
  ACTION_KIND_LABEL,
  STATUS_LABELS,
  type Action,
  type InlineSuggestion,
  type ReplyAction,
  type ThreadRead,
  fingerprintAgentRead,
  sanitizeAgentReadReasoning,
  urgencyTierFromScore,
} from "@workspace/schemas/signals";
import { Avatar } from "@workspace/ui/components/avatar";
import { ActionButton } from "@workspace/ui/components/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card";
import type { schema } from "api/schema";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import { Brain } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ThreadSummaryHoverCard } from "~/components/chips";
import { RichMarkdown } from "~/components/markdown/rich-markdown";
import { buildThreadParam } from "~/utils/thread";
import { ActionRow } from "./action-row";
import {
  acceptInlineSuggestion,
  acceptThreadRead,
  dismissInlineSuggestion,
  dismissThreadRead,
  type ActorContext,
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

function bundleLabel(actions: Action[]): string {
  if (actions.length === 0) return "Apply";
  if (actions.length === 1) return ACTION_KIND_LABEL[actions[0].kind];
  return `Run primary (${actions.length} actions)`;
}

function primaryReplyAction(primary: Action[]): ReplyAction | undefined {
  return primary.find((action): action is ReplyAction => action.kind === "reply");
}

function primaryIncludesReply(primary: Action[]): boolean {
  return primaryReplyAction(primary) != null;
}

function primaryReplyDraftMarkdown(primary: Action[]): string {
  return primaryReplyAction(primary)?.draftMarkdown ?? "";
}

function primarySendLabel(primary: Action[]): string {
  if (primary.length === 1 && primary[0]?.kind === "reply") {
    return ACTION_KIND_LABEL.reply;
  }
  return "Send";
}

function inlineSuggestionLabel(suggestion: InlineSuggestion): string {
  if (suggestion.action.kind === "set_status") {
    const status = STATUS_LABELS[suggestion.action.status] ?? suggestion.action.status;
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
  const primaryNeedsReplyEditor = primaryIncludesReply(read.primary);
  const [replyDraft, setReplyDraft] = useState(() =>
    primaryReplyDraftMarkdown(read.primary),
  );
  const [replyEditorRevision, setReplyEditorRevision] = useState(0);
  const inlineSuggestions = (thread.inlineSuggestions ?? []).filter(
    (suggestion) => !suggestion.dismissedAt,
  );

  useEffect(() => {
    setReplyEditorOpen(false);
    setReplyDraft(primaryReplyDraftMarkdown(read.primary));
    setReplyEditorRevision((revision) => revision + 1);
  }, [readFingerprint, read.primary]);

  const handleAcceptPrimary = async (replyDraft?: string) => {
    setBusyKey("primary");
    try {
      await acceptThreadRead({
        threadId: thread.id,
        read,
        selection: "primary",
        ctx,
        replyDraft,
      });
      setReplyEditorOpen(false);
    } catch (error) {
      toast.error(formatErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  };

  const handlePrimaryClick = () => {
    if (primaryNeedsReplyEditor) {
      setReplyEditorOpen(true);
      return;
    }
    void handleAcceptPrimary();
  };

  const handleCancelReplyEditor = () => {
    setReplyEditorOpen(false);
    setReplyDraft(primaryReplyDraftMarkdown(read.primary));
    setReplyEditorRevision((revision) => revision + 1);
  };

  const handleSendReply = () => {
    const trimmed = replyDraft.trim();
    if (trimmed.length === 0) return;
    void handleAcceptPrimary(trimmed);
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
          <ActionRow.Dismiss
            onClick={handleDismissRead}
            label="Dismiss read"
          />
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
        {replyEditorOpen ? (
          <>
            <ActionButton
              size="sm"
              variant="ghost"
              onClick={handleCancelReplyEditor}
              disabled={busyKey !== null}
            >
              Cancel
            </ActionButton>
            <ActionButton
              size="sm"
              variant="primary"
              onClick={handleSendReply}
              disabled={busyKey !== null || replyDraft.trim().length === 0}
            >
              {primarySendLabel(read.primary)}
            </ActionButton>
          </>
        ) : (
          <ActionButton
            size="sm"
            variant="primary"
            onClick={handlePrimaryClick}
            disabled={busyKey !== null}
          >
            {bundleLabel(read.primary)}
          </ActionButton>
        )}
      </ActionRow.Actions>
    </ActionRow.Root>
  );
}
