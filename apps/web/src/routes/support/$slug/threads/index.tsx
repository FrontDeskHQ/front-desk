import { createFileRoute, Link } from "@tanstack/react-router";
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
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@workspace/ui/components/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
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
  Settings2,
} from "lucide-react";
import {
  createStandardSchemaV1,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
} from "nuqs";
import { fetchClient } from "~/lib/live-state";
import { seo } from "~/utils/seo";

const DEFAULT_THREADS_PER_PAGE = 10;
const PER_PAGE_OPTIONS = [5, 10, 20, 50];

const searchParams = {
  cursor: parseAsString,
  dir: parseAsStringEnum(["asc", "desc"]).withDefault("desc"),
  perPage: parseAsInteger.withDefault(DEFAULT_THREADS_PER_PAGE),
};

export const Route = createFileRoute("/support/$slug/threads/")({
  component: RouteComponent,

  validateSearch: createStandardSchemaV1(searchParams, {
    partialOutput: true,
  }),

  loaderDeps: ({ search }) => ({
    cursor: (search as Record<string, unknown>)?.cursor as string | undefined,
    dir: ((search as Record<string, unknown>)?.dir as string) ?? "desc",
    perPage:
      ((search as Record<string, unknown>)?.perPage as number) ??
      DEFAULT_THREADS_PER_PAGE,
  }),

  loader: async ({ context, deps }) => {
    const { organization } = context;
    const perPage = Math.min(Math.max(deps.perPage, 1), 50);

    const result = await fetchClient.query.thread.list({
      organizationId: organization.id,
      cursor: deps.cursor ?? undefined,
      limit: perPage,
      direction: (deps.dir as "asc" | "desc") ?? "desc",
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
  const { threads, nextCursor } = Route.useLoaderData();
  const { organization } = Route.useRouteContext();
  const navigate = Route.useNavigate();
  const { cursor, dir, perPage: rawPerPage } = Route.useSearch();

  const perPage = Math.min(
    Math.max(rawPerPage ?? DEFAULT_THREADS_PER_PAGE, 1),
    50,
  );

  const isFirstPage = !cursor;

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
                                  perPage,
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
          <CardContent className="overflow-y-auto gap-0 items-center">
            {threads?.map((thread) => (
              <Link
                key={thread.id}
                to={"/support/$slug/threads/$id"}
                params={{ slug: organization.slug, id: thread.id }}
                className="w-full max-w-5xl flex flex-col p-3 gap-2 hover:bg-muted"
                resetScroll={false}
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
                    {
                      thread?.messages?.[thread.messages.length - 1]?.author
                        ?.name
                    }
                    :&nbsp;
                    <span className="max-w-full">
                      {getFirstTextContent(
                        safeParseJSON(
                          thread?.messages?.[thread.messages.length - 1]
                            ?.content ?? "",
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
            ))}
          </CardContent>
        </Card>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Threads per page
            </span>
            <Select
              value={perPage.toString()}
              onValueChange={(value) =>
                navigate({
                  search: { dir, perPage: Number(value) },
                })
              }
            >
              <SelectTrigger className="w-20" data-size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PER_PAGE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option.toString()}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  render={
                    <Link
                      to="/support/$slug/threads"
                      params={{ slug: organization.slug }}
                      search={{ dir, perPage }}
                    />
                  }
                  aria-disabled={isFirstPage}
                  className={
                    isFirstPage ? "pointer-events-none opacity-50" : ""
                  }
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  render={
                    <Link
                      to="/support/$slug/threads"
                      params={{ slug: organization.slug }}
                      search={{
                        cursor: nextCursor ?? undefined,
                        dir,
                        perPage,
                      }}
                    />
                  }
                  aria-disabled={!nextCursor}
                  className={
                    !nextCursor ? "pointer-events-none opacity-50" : ""
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div>
  );
}
