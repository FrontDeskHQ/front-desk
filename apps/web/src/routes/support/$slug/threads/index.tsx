import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Avatar } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
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
import { useEffect, useRef } from "react";
import { fetchClient } from "~/lib/live-state";
import { seo } from "~/utils/seo";
import { buildThreadParam } from "~/utils/thread";

const PAGE_SIZE = 20;

const searchParams = {
  dir: parseAsStringEnum(["asc", "desc"]).withDefault("desc"),
};

export const Route = createFileRoute("/support/$slug/threads/")({
  component: RouteComponent,

  validateSearch: createStandardSchemaV1(searchParams, {
    partialOutput: true,
  }),

  loaderDeps: ({ search }) => ({
    dir: search.dir ?? ("desc" as const),
  }),

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
});

function RouteComponent() {
  const loaderData = Route.useLoaderData();
  const { organization } = Route.useRouteContext();
  const search = Route.useSearch();
  const dir = search.dir ?? "desc";

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["support-threads", organization?.id, dir],
      enabled: Boolean(organization?.id),
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
      initialPageParam: undefined as string | undefined,
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
    });

  const threads = data?.pages.flatMap((page) => page.threads) ?? [];

  const parentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 10,
    getItemKey: (index) => threads[index]?.id ?? `thread-fallback-${index}`,
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: parentRef.current, rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (!organization) {
    return null;
  }

  return (
    <div className="w-full">
      <div className="flex flex-col gap-8 mx-auto py-8 px-4 sm:px-6 lg:px-8 max-w-5xl">
        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle className="gap-4">Threads</CardTitle>
            <CardAction side="right">
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
            </CardAction>
          </CardHeader>
          <CardContent className="overflow-hidden gap-0 p-0">
            <div
              ref={parentRef}
              className="overflow-y-auto"
              style={{ maxHeight: "calc(100vh - 16rem)" }}
            >
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
              >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const thread = threads[virtualItem.index];
                  if (!thread) return null;

                  return (
                    <Link
                      key={thread.id}
                      ref={virtualizer.measureElement}
                      data-index={virtualItem.index}
                      to={"/support/$slug/threads/$id"}
                      params={{
                        slug: organization.slug,
                        id: buildThreadParam(thread),
                      }}
                      className="w-full flex flex-col p-3 gap-2 hover:bg-muted"
                      resetScroll={false}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <div className="flex justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar
                            variant="user"
                            size="md"
                            fallback={thread?.author?.name}
                          />
                          <div>{thread?.name}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 mr-1">
                            {thread?.labels
                              ?.filter(
                                (tl) => tl.enabled && !!tl.label?.enabled,
                              )
                              .map((threadLabel) => (
                                <LabelBadge
                                  key={threadLabel.label.id}
                                  name={threadLabel.label?.name}
                                  color={threadLabel.label?.color}
                                />
                              ))}
                          </div>
                          <PriorityIndicator
                            priority={thread?.priority ?? 0}
                          />
                          <StatusIndicator status={thread?.status ?? 0} />
                        </div>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground min-w-0 flex-1 text-nowrap font-medium truncate max-w-2xl">
                          {
                            thread?.messages?.[thread.messages.length - 1]
                              ?.author?.name
                          }
                          :&nbsp;
                          <span className="max-w-full">
                            {getFirstTextContent(
                              safeParseJSON(
                                thread?.messages?.[
                                  thread.messages.length - 1
                                ]?.content ?? "",
                              ),
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
