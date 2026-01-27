import { useLiveQuery } from "@live-state/sync/client";
import { Link } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { ChevronRightIcon } from "lucide-react";
import { useMemo } from "react";
import { query } from "~/lib/live-state";

type SimilarThreadResult = {
  threadId: string;
  score: number;
};

const RelatedThreadResult = ({ result }: { result: SimilarThreadResult }) => {
  const thread = useLiveQuery(
    query.thread.first({ id: result.threadId }).include({
      author: {
        user: true,
      },
    }),
  );

  if (!thread || !!thread.deletedAt) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      className="text-foreground-secondary hover:text-foreground px-1.5 cursor-default"
      key={result.threadId}
      render={<Link to="/app/threads/$id" params={{ id: thread.id }} />}
    >
      <Avatar
        variant="user"
        size="md"
        fallback={thread.author.user?.name ?? thread.author.name ?? "Unknown"}
        src={thread.author.user?.image}
      />
      <div className="grow shrink truncate">{thread.name}</div>
      <div className="flex gap-1 ml-auto">
        <ChevronRightIcon className="size-4" />
      </div>
    </Button>
  );
};

export function RelatedThreadsSection({ threadId }: { threadId: string }) {
  const relatedThreadSuggestions = useLiveQuery(
    query.suggestion.where({
      entityId: threadId,
      type: "related_threads",
    }),
  );

  const results: SimilarThreadResult[] = useMemo(() => {
    if (!relatedThreadSuggestions || relatedThreadSuggestions.length === 0) {
      return [];
    }

    return relatedThreadSuggestions
      .filter(
        (s): s is typeof s & { relatedEntityId: string } => !!s.relatedEntityId,
      )
      .map((s) => {
        let score = 0;
        if (s.resultsStr) {
          try {
            const parsed = JSON.parse(s.resultsStr);
            score = parsed.score ?? 0;
          } catch {
            // Ignore parse errors
          }
        }
        return {
          threadId: s.relatedEntityId,
          score,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [relatedThreadSuggestions]);

  if (results.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <div className="text-muted-foreground text-xs">Related threads</div>
      <div className="flex flex-col gap-px">
        {results.map((result) => (
          <RelatedThreadResult key={result.threadId} result={result} />
        ))}
      </div>
    </div>
  );
}
