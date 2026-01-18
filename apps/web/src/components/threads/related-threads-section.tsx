import { useLiveQuery } from "@live-state/sync/client";
import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ChevronRightIcon } from "lucide-react";
import { useMemo } from "react";
import { query } from "~/lib/live-state";

type SimilarThreadResult = {
  threadId: string;
  score: number;
};

const RelatedThreadResult = ({ result }: { result: SimilarThreadResult }) => {
  const thread = useLiveQuery(query.thread.first({ id: result.threadId }));

  if (!thread || !!thread.deletedAt) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      className="group px-1.5"
      key={result.threadId}
      render={<Link to="/app/threads/$id" params={{ id: thread.id }} />}
    >
      <div className="grow shrink truncate">{thread.name}</div>
      <div className="flex gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity duration-200 group-hover:duration-0">
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
