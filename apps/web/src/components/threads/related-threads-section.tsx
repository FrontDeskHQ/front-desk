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
        fallback={thread.author.user?.name ?? "Unknown"}
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
  const relatedThreads = useLiveQuery(
    query.suggestion.first({
      entityId: threadId,
      type: "related_threads",
    }),
  );

  const results: SimilarThreadResult[] = useMemo(() => {
    try {
      if (!relatedThreads?.resultsStr) {
        return [];
      }
      return JSON.parse(relatedThreads.resultsStr);
    } catch {
      return [];
    }
  }, [relatedThreads?.resultsStr]);

  if (!relatedThreads || results.length === 0) {
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
