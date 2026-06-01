import type { InferLiveObject } from "@live-state/sync";
import { Link } from "@tanstack/react-router";
import {
  ACTION_KIND_LABEL,
  STATUS_LABELS,
  type Action,
  type InlineSuggestion,
  type ThreadRead,
  urgencyTierFromScore,
} from "@workspace/schemas/signals";
import { Avatar } from "@workspace/ui/components/avatar";
import { ActionButton } from "@workspace/ui/components/button";
import type { schema } from "api/schema";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
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

export type ThreadWithRelations = InferLiveObject<
  typeof schema.thread,
  {
    author: { include: { user: true } };
    assignedUser: { include: { user: true } };
  }
>;

type Props = {
  thread: ThreadWithRelations & { agentRead: ThreadRead };
  relatedThreads: Map<string, ThreadWithRelations>;
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

function inlineSuggestionLabel(suggestion: InlineSuggestion): string {
  if (suggestion.action.kind === "set_status") {
    const status = STATUS_LABELS[suggestion.action.status] ?? suggestion.action.status;
    return `Set status: ${status}`;
  }
  return `Apply label (${suggestion.action.labelId})`;
}

function ActionSummary({
  action,
  relatedThreads,
}: {
  action: Action;
  relatedThreads: Map<string, ThreadWithRelations>;
}) {
  if (action.kind === "mark_duplicate") {
    const targetThread = relatedThreads.get(action.targetThreadId);
    if (targetThread) {
      return (
        <span className="inline-flex items-center gap-1.5">
          <span>Mark duplicate of</span>
          <ThreadRef thread={targetThread} />
        </span>
      );
    }
    return <span>Mark duplicate of thread {action.targetThreadId}</span>;
  }

  if (action.kind === "link_pr") {
    return (
      // biome-ignore lint/a11y/useAnchorContent: Content is provided via children
      <a
        href={action.prUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 hover:underline"
      >
        <span>Link pull request</span>
        <ExternalLink className="size-3.5" />
      </a>
    );
  }

  if (action.kind === "reply") {
    return (
      <span>
        Send reply:{" "}
        <RichMarkdown
          content={action.draftMarkdown}
          preset="inline"
          className="inline text-sm"
        />
      </span>
    );
  }

  return <span>{ACTION_KIND_LABEL[action.kind]}</span>;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes("STALE_AGENT_READ")) {
    return "This signal changed in the background. Refresh and try again.";
  }
  return "Could not apply this signal. Please try again.";
}

export function ThreadReadCard({ thread, relatedThreads, ctx }: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const read = thread.agentRead;
  const inlineSuggestions = (thread.inlineSuggestions ?? []).filter(
    (suggestion) => !suggestion.dismissedAt,
  );

  const handleAcceptPrimary = async () => {
    setBusyKey("primary");
    try {
      await acceptThreadRead({
        threadId: thread.id,
        read,
        selection: "primary",
        ctx,
      });
    } catch (error) {
      toast.error(formatErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
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
            className="font-medium text-foreground-primary"
          />
        </ActionRow.Reason>
        <div className="pl-6 text-xs text-foreground-secondary">
          <RichMarkdown content={read.reasoning} preset="inline" />
        </div>
        <div className="pl-6 flex flex-col gap-1 text-sm text-foreground-primary">
          {read.primary.map((action, index) => (
            <ActionSummary
              key={`${thread.id}:primary:${action.kind}:${index}`}
              action={action}
              relatedThreads={relatedThreads}
            />
          ))}
        </div>
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
        <ActionRow.Dismiss
          onClick={handleDismissRead}
          label="Dismiss read"
        />
      </ActionRow.Header>
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
        <ActionButton
          size="sm"
          variant="primary"
          onClick={handleAcceptPrimary}
          disabled={busyKey !== null}
        >
          {bundleLabel(read.primary)}
        </ActionButton>
      </ActionRow.Actions>
    </ActionRow.Root>
  );
}
