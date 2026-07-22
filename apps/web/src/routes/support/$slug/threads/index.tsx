import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Avatar } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import {
  PriorityIndicator,
  StatusIndicator,
} from "@workspace/ui/components/indicator";
import { LabelBadge } from "@workspace/ui/components/label-badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { getFirstTextContent, safeParseJSON } from "@workspace/ui/lib/tiptap";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Loader2,
  Settings2,
} from "lucide-react";
import { createStandardSchemaV1, parseAsStringEnum } from "nuqs";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { fetchClient } from "~/lib/live-state";
import { seo } from "~/utils/seo";
import { buildThreadParam } from "~/utils/thread";

const PAGE_SIZE = 20;

const searchParams = {
  dir: parseAsStringEnum(["asc", "desc"]).withDefault("desc"),
};

export const Route = createFileRoute("/support/$slug/threads/")({
  component: RouteComponent,

  head: ({ loaderData }) => {
    const orgName = loaderData?.organizationName ?? "Support";
    return {
      meta: [
        ...seo({
          title: `${orgName} - Support`,
          description: `Support threads for ${orgName}`,
        }),
      ],
    };
  },

  loader: async ({ context, deps }) => {
    const { organization } = context;

    const result = await fetchClient.query.thread.list({
      organizationId: organization.id,
      limit: PAGE_SIZE,
      direction: deps.dir,
    });

    return {
      threads: result.threads,
      nextCursor: result.nextCursor,
      organizationName: organization.name,
    };
  },

  loaderDeps: ({ search }) => ({
    dir: search.dir ?? ("desc" as const),
  }),

  validateSearch: createStandardSchemaV1(searchParams, {
    partialOutput: true,
  }),
});

function RouteComponent() {
  const loaderData = Route.useLoaderData();
  const { organization } = Route.useRouteContext();
  const search = Route.useSearch();
  const dir = search.dir ?? "desc";

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      enabled: Boolean(organization?.id),
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialData: loaderData
        ? {
            pages: [
              {
                threads: loaderData.threads,
                nextCursor: loaderData.nextCursor,
              },
            ],
            pageParams: [undefined],
          }
        : undefined,
      initialPageParam: undefined as string | undefined,
      queryFn: async ({ pageParam }) => {
        const organizationId = organization?.id;
        if (!organizationId) {
          throw new Error("Organization is required to fetch threads");
        }

        return fetchClient.query.thread.list({
          organizationId,
          cursor: pageParam,
          limit: PAGE_SIZE,
          direction: dir,
        });
      },
      queryKey: ["support-threads", organization?.id, dir],
    });

  const threads = data?.pages.flatMap((page) => page.threads) ?? [];

  const parentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Scroll against the page-level scroll container (set in support/$slug
  // route.tsx) so the list scrolls with the whole page instead of an inner box.
  useLayoutEffect(() => {
    const updateScrollMetrics = () => {
      const parent = parentRef.current;
      const scrollEl =
        parent?.closest<HTMLElement>("[data-portal-scroll]") ?? null;
      scrollRef.current = scrollEl;
      if (parent && scrollEl) {
        setScrollMargin(
          parent.getBoundingClientRect().top -
            scrollEl.getBoundingClientRect().top +
            scrollEl.scrollTop
        );
      }
    };

    updateScrollMetrics();
    window.addEventListener("resize", updateScrollMetrics);
    return () => window.removeEventListener("resize", updateScrollMetrics);
  }, []);

  const virtualizer = useVirtualizer({
    count: threads.length,
    estimateSize: () => 72,
    getItemKey: (index) => threads[index]?.id ?? `thread-fallback-${index}`,
    getScrollElement: () => scrollRef.current,
    overscan: 10,
    scrollMargin,
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: scrollRef.current, rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (!organization) {
    return null;
  }

  return (
    <div className="w-full">
      <div className="flex flex-col gap-4 mx-auto py-8 px-4 sm:px-6 lg:px-8 max-w-6xl">
        <div className="flex items-center justify-between gap-4 px-3">
          <h1 className="text-lg font-medium">Threads</h1>
          <Popover>
            <PopoverTrigger>
              <Button variant="outline" size="sm">
                <Settings2 />
                View
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="p-4 flex flex-col gap-4"
              positionerProps={{ align: "end" }}
            >
              <div className="flex w-full items-center gap-2">
                <div className="mr-auto">Direction</div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Button
                        variant="outline"
                        size="sm"
                        render={
                          <Link
                            to="/support/$slug/threads"
                            params={{ slug: organization.slug }}
                            search={{
                              dir: dir === "asc" ? "desc" : "asc",
                            }}
                          />
                        }
                        className="size-8"
                      >
                        {dir === "asc" ? (
                          <ArrowDownWideNarrow />
                        ) : (
                          <ArrowUpNarrowWide />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Change order direction</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div ref={parentRef}>
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const thread = threads[virtualItem.index];
              if (!thread) {
                return null;
              }

              return (
                <Link
                  key={thread.id}
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                  to="/support/$slug/threads/$id"
                  params={{
                    id: buildThreadParam(thread),
                    slug: organization.slug,
                  }}
                  className="max-w-6xl w-full flex flex-col p-3 gap-2 mx-auto hover:bg-muted"
                  resetScroll={false}
                  style={{
                    left: 0,
                    position: "absolute",
                    right: 0,
                    top: 0,
                    transform: `translateY(${
                      virtualItem.start - scrollMargin
                    }px)`,
                  }}
                >
                  <div className="flex justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar
                        variant="user"
                        size="md"
                        fallback={thread?.author?.name}
                      />
                      <span className="truncate">{thread?.name}</span>
                      {thread?.shortId !== null && (
                        <span className="text-foreground-secondary tabular-nums font-normal">
                          #{thread.shortId}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 mr-1">
                        {thread?.labels
                          ?.filter((tl) => tl.enabled && !!tl.label?.enabled)
                          .map((threadLabel) => (
                            <LabelBadge
                              key={threadLabel.label.id}
                              name={threadLabel.label?.name}
                              color={threadLabel.label?.color}
                            />
                          ))}
                      </div>
                      <PriorityIndicator priority={thread?.priority ?? 0} />
                      <StatusIndicator status={thread?.status ?? 0} />
                    </div>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground min-w-0 flex-1 text-nowrap font-medium truncate max-w-2xl">
                      {thread?.messages.at(-1)?.author?.name}
                      :&nbsp;
                      <span className="max-w-full">
                        {getFirstTextContent(
                          safeParseJSON(thread?.messages.at(-1)?.content ?? "")
                        )}
                      </span>
                    </span>
                    <div className="text-muted-foreground flex-shrink-0">
                      {thread?.createdAt
                        ? formatRelativeTime(thread?.createdAt as Date)
                        : null}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          <div ref={sentinelRef} className="h-1" />
          {isFetchingNextPage && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
