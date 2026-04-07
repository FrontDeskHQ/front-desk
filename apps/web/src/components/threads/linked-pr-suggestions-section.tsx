import { useLiveQuery } from "@live-state/sync/client";
import { ActionButton } from "@workspace/ui/components/button";
import { Check, GitPullRequest, X } from "lucide-react";
import { useMemo } from "react";
import { ulid } from "ulid";
import { mutate, query } from "~/lib/live-state";

type ParsedLinkedPrSuggestion = {
  id: string;
  prId: number;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  repo: string;
  confidence: number;
  reasoning: string;
};

interface LinkedPrSuggestionsSectionProps {
  threadId: string;
  externalPrId: string | null;
  user: { id: string; name: string };
  captureThreadEvent: (
    eventName: string,
    properties?: Record<string, unknown>,
  ) => void;
}

export function LinkedPrSuggestionsSection({
  threadId,
  externalPrId,
  user,
  captureThreadEvent,
}: LinkedPrSuggestionsSectionProps) {
  const suggestions = useLiveQuery(
    query.suggestion.where({
      entityId: threadId,
      type: "linked_pr",
      active: true,
    }),
  );

  const parsed: ParsedLinkedPrSuggestion[] = useMemo(() => {
    if (!suggestions || suggestions.length === 0) return [];

    return suggestions
      .map((s): ParsedLinkedPrSuggestion | null => {
        if (!s.resultsStr) return null;
        try {
          const data = JSON.parse(s.resultsStr);
          if (
            typeof data.prId !== "number" ||
            typeof data.prNumber !== "number" ||
            typeof data.repo !== "string"
          ) {
            return null;
          }
          return {
            id: s.id,
            prId: data.prId,
            prNumber: data.prNumber,
            prTitle: data.prTitle ?? "",
            prUrl: data.prUrl ?? "",
            repo: data.repo,
            confidence: data.confidence ?? 0,
            reasoning: data.reasoning ?? "",
          };
        } catch {
          return null;
        }
      })
      .filter((s): s is ParsedLinkedPrSuggestion => s !== null)
      .filter((s) => {
        // Hide a suggestion that matches the already-linked PR.
        if (!externalPrId) return true;
        return externalPrId !== `github:${s.repo}#${s.prId}`;
      })
      .sort((a, b) => b.confidence - a.confidence);
  }, [suggestions, externalPrId]);

  const handleApply = (s: ParsedLinkedPrSuggestion) => {
    const newExternalPrId = `github:${s.repo}#${s.prId}`;
    const oldPrId = externalPrId ?? null;

    mutate.thread.update(threadId, { externalPrId: newExternalPrId });

    mutate.update.insert({
      id: ulid().toLowerCase(),
      threadId,
      type: "pr_changed",
      createdAt: new Date(),
      userId: user.id,
      metadataStr: JSON.stringify({
        oldPrId,
        newPrId: newExternalPrId,
        oldPrLabel: null,
        newPrLabel: `${s.repo}#${s.prNumber}`,
        userName: user.name,
        source: "thread",
      }),
      replicatedStr: JSON.stringify({}),
    });

    mutate.suggestion.update(s.id, {
      accepted: true,
      active: false,
      updatedAt: new Date(),
    });

    captureThreadEvent("thread:pr_suggestion_accept", {
      suggestion_id: s.id,
      pr_number: s.prNumber,
      repo: s.repo,
    });
  };

  const handleDismiss = (s: ParsedLinkedPrSuggestion) => {
    mutate.suggestion.update(s.id, {
      accepted: false,
      active: false,
      updatedAt: new Date(),
    });

    captureThreadEvent("thread:pr_suggestion_dismiss", {
      suggestion_id: s.id,
      pr_number: s.prNumber,
      repo: s.repo,
    });
  };

  if (parsed.length === 0) return null;

  const handleApplyAll = () => {
    for (const s of parsed) handleApply(s);
  };
  const handleDismissAll = () => {
    for (const s of parsed) handleDismiss(s);
  };

  return (
    <div className="flex flex-col gap-1 mt-1 border rounded-md p-2 group/pr-suggestion">
      <div className="flex items-center gap-1">
        <div className="text-foreground-secondary text-xs flex items-center gap-1 grow">
          Pull Request suggestion
        </div>
        <div className="flex gap-0.5 shrink-0 opacity-0 group-hover/pr-suggestion:opacity-100 transition-opacity duration-150 group-hover/pr-suggestion:duration-0">
          <ActionButton
            variant="ghost"
            size="icon-sm"
            tooltip={parsed.length > 1 ? "Apply all" : "Apply"}
            onClick={handleApplyAll}
          >
            <Check className="size-3" />
          </ActionButton>
          <ActionButton
            variant="ghost"
            size="icon-sm"
            tooltip={parsed.length > 1 ? "Dismiss all" : "Dismiss"}
            onClick={handleDismissAll}
          >
            <X className="size-3" />
          </ActionButton>
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        {parsed.map((s) => (
          <LinkedPrSuggestionRow key={s.id} suggestion={s} />
        ))}
      </div>
    </div>
  );
}

function LinkedPrSuggestionRow({
  suggestion,
}: {
  suggestion: ParsedLinkedPrSuggestion;
}) {
  return (
    <ActionButton
      size="sm"
      variant="ghost"
      className="justify-start text-sm p-0 min-w-0 has-[>svg]:px-2 h-7 w-full max-w-52"
      tooltip={`${suggestion.repo}#${suggestion.prNumber}`}
      render={
        // biome-ignore lint/a11y/useAnchorContent: content is provided via children
        <a href={suggestion.prUrl} target="_blank" rel="noopener noreferrer" />
      }
    >
      <GitPullRequest className="size-4 shrink-0" />
      <span className="truncate shrink grow text-left">
        #{suggestion.prNumber} {suggestion.prTitle}
      </span>
    </ActionButton>
  );
}
