import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { ChevronRightIcon } from "lucide-react";
import { fetchClient } from "~/lib/live-state";

type RelatedThread = {
  id: string;
  name: string;
  deletedAt?: Date | null;
  author?: {
    name?: string | null;
    user?: {
      name?: string | null;
      image?: string | null;
    } | null;
  } | null;
};

type SupportRelatedThreadsSectionProps = {
  threadId: string;
  organizationId: string;
  slug: string;
};

export const SupportRelatedThreadsSection = ({
  threadId,
  organizationId,
  slug,
}: SupportRelatedThreadsSectionProps) => {
  const { data: relatedThreads = [] } = useQuery<RelatedThread[]>({
    queryKey: ["related-threads", threadId, organizationId],
    queryFn: async (): Promise<RelatedThread[]> => {
      if (!threadId || !organizationId) {
        return [];
      }

      try {
        const results = await fetchClient.mutate.thread.fetchRelatedThreads({
          threadId,
          organizationId,
        });

        return results ?? [];
      } catch (error) {
        console.error("Failed to load related threads", error);
        return [];
      }
    },
    enabled: !!threadId && !!organizationId,
  });

  if (relatedThreads.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <div className="text-muted-foreground text-xs">Related threads</div>
      <div className="flex flex-col gap-px">
        {relatedThreads.map((relatedThread) => (
          <Button
            key={relatedThread.id}
            variant="link"
            className="text-foreground-secondary hover:text-foreground px-1.5"
            render={
              <Link
                to="/support/$slug/threads/$id"
                params={{ slug, id: relatedThread.id }}
              />
            }
          >
            <Avatar
              variant="user"
              size="md"
              fallback={
                relatedThread.author?.user?.name ??
                relatedThread.author?.name ??
                "Unknown"
              }
              src={relatedThread.author?.user?.image}
            />
            <div className="grow shrink truncate">{relatedThread.name}</div>
            <div className="flex gap-1 ml-auto">
              <ChevronRightIcon className="size-4" />
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
};
