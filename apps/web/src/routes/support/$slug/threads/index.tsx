import { createFileRoute, Link } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { Button, buttonVariants } from "@workspace/ui/components/button";
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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
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
  ChevronLeftIcon,
  ChevronRightIcon,
  Settings2,
} from "lucide-react";
import z from "zod";
import { fetchClient } from "~/lib/live-state";
import { seo } from "~/utils/seo";

type ThreadsSearchOrderOptions = "createdAt" | "updatedAt";

export const Route = createFileRoute("/support/$slug/threads/")({
  component: RouteComponent,

  validateSearch: z.object({
    page: z.coerce.number().optional(),
    order: z.enum(["createdAt", "updatedAt"]).optional(),
    dir: z.enum(["asc", "desc"]).optional(),
    perPage: z.coerce.number().optional(),
  }),

  loader: async ({ context }) => {
    const { organization } = context;
    const threads = await fetchClient.query.thread
      .where({
        organizationId: organization.id,
        deletedAt: { $eq: null },
      })
      .include({ messages: { author: true }, author: true, assignedUser: true })
      .get();

    return {
      threads: threads as typeof threads,
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

const DEFAULT_THREADS_PER_PAGE = 10;
const PER_PAGE_OPTIONS = [5, 10, 20, 50];

function RouteComponent() {
  const { threads } = Route.useLoaderData();
  const { organization } = Route.useRouteContext();

  const navigate = Route.useNavigate();
  const searchParams = Route.useSearch();

  // Apply defaults in the component, not in validateSearch
  const page = searchParams.page ?? 1;
  const order = searchParams.order ?? "createdAt";
  const dir = searchParams.dir ?? "desc";
  const perPage = searchParams.perPage ?? DEFAULT_THREADS_PER_PAGE;

  const orderByOptions: { label: string; value: ThreadsSearchOrderOptions }[] =
    [
      { label: "Created", value: "createdAt" },
      { label: "Last message", value: "updatedAt" },
    ];

  const handleSortChange = (value: ThreadsSearchOrderOptions) => {
    navigate({
      to: ".",
      search: (prev) => ({ ...prev, order: value }),
    });
  };

  const handlePerPageChange = (value: unknown) => {
    navigate({
      to: ".",
      search: (prev) => ({ ...prev, perPage: Number(value), page: 1 }),
    });
  };

  const orderedThreads = [...(threads ?? [])].sort((a, b) => {
    const getTimestamp = (
      t: unknown,
      key: ThreadsSearchOrderOptions,
    ): number => {
      // Narrow the unknown to the expected shape for safe property access
      const obj = t as { updatedAt?: string | Date; createdAt?: string | Date };

      if (key === "updatedAt") {
        return obj.updatedAt
          ? new Date(obj.updatedAt).getTime()
          : obj.createdAt
            ? new Date(obj.createdAt).getTime()
            : 0;
      }

      return obj.createdAt ? new Date(obj.createdAt).getTime() : 0;
    };

    const aTs = getTimestamp(a, order);
    const bTs = getTimestamp(b, order);

    // dir: 'asc' => oldest -> newest (a - b). 'desc' => newest -> oldest (b - a)
    if (dir === "asc") {
      return aTs - bTs;
    }

    return bTs - aTs;
  });

  const numPages = orderedThreads
    ? Math.ceil(orderedThreads?.length / perPage)
    : 1;

  const currentPage = page ?? 1;

  const startIdx = perPage * (currentPage - 1);
  const endIdx = perPage * currentPage;

  const threadsInPage = orderedThreads?.slice(startIdx, endIdx);

  // Generate page numbers based on current position
  const generatePageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];

    if (numPages <= 5) {
      // Show all pages if total pages <= 5
      for (let i = 1; i <= numPages; i++) {
        pages.push(i);
      }
    } else if (currentPage <= 3) {
      // At the beginning: 1, 2, 3, ..., lastPageIdx
      pages.push(1, 2, 3, "ellipsis", numPages);
    } else if (currentPage >= numPages - 2) {
      // At the end: 1, ..., lastPageIdx - 2, lastPageIdx - 1, lastPageIdx
      pages.push(1, "ellipsis", numPages - 2, numPages - 1, numPages);
    } else {
      // In the middle: 1, ..., currentPageIdx, ..., lastPageIdx
      pages.push(1, "ellipsis", currentPage, "ellipsis", numPages);
    }

    return pages;
  };

  const pageNumbers = generatePageNumbers();

  if (!organization) {
    return null;
  }

  return (
    <div className="w-full py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-8 mx-auto max-w-5xl">
        <Card className="bg-muted/30 w-full">
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
                    <div className="mr-auto">Order by</div>
                    <Select
                      value={order}
                      onValueChange={(value) =>
                        handleSortChange(value as ThreadsSearchOrderOptions)
                      }
                      items={orderByOptions}
                    >
                      <SelectTrigger className="w-48" data-size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {orderByOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              navigate({
                                to: ".",
                                search: (prev) => ({
                                  ...prev,
                                  dir: dir === "asc" ? "desc" : "asc",
                                }),
                              })
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
            {threadsInPage?.map((thread) => (
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
                    <PriorityIndicator
                      priority={(thread as any)?.priority ?? 0}
                    />
                    <StatusIndicator status={(thread as any)?.status ?? 0} />
                  </div>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground min-w-0 flex-1 text-nowrap font-medium truncate max-w-2xl">
                    {
                      (thread as any)?.messages?.[
                        (thread as any)?.messages?.length - 1
                      ]?.author?.name
                    }
                    :&nbsp;
                    <span className="max-w-full">
                      {getFirstTextContent(
                        safeParseJSON(
                          (thread as any)?.messages?.[
                            (thread as any)?.messages?.length - 1
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
              onValueChange={handlePerPageChange}
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
                <Link
                  to="."
                  search={(prev) => ({ ...prev, page: currentPage - 1 })}
                  disabled={currentPage === 1}
                  className={
                    buttonVariants({
                      variant: "ghost",
                      size: "default",
                    }) +
                    " gap-1 px-2.5 sm:pl-2.5" +
                    (currentPage === 1 ? " pointer-events-none opacity-50" : "")
                  }
                  aria-label="Go to previous page"
                  aria-disabled={currentPage === 1}
                  resetScroll={false}
                >
                  <ChevronLeftIcon />
                  <span className="hidden sm:block">Previous</span>
                </Link>
              </PaginationItem>
              {pageNumbers.map((pageNum, idx) => {
                if (pageNum === "ellipsis") {
                  return (
                    <PaginationItem
                      key={`ellipsis-before-${pageNumbers[idx + 1]}`}
                    >
                      <PaginationEllipsis />
                    </PaginationItem>
                  );
                }

                return (
                  <PaginationItem key={pageNum}>
                    <Link
                      to="."
                      search={(prev) => ({ ...prev, page: pageNum })}
                      aria-current={page === pageNum ? "page" : undefined}
                      className={buttonVariants({
                        variant: page === pageNum ? "outline" : "ghost",
                        size: "icon",
                      })}
                      resetScroll={false}
                    >
                      {pageNum}
                    </Link>
                  </PaginationItem>
                );
              })}
              <PaginationItem>
                <Link
                  to="."
                  search={(prev) => ({ ...prev, page: currentPage + 1 })}
                  disabled={currentPage === numPages}
                  className={
                    buttonVariants({
                      variant: "ghost",
                      size: "default",
                    }) +
                    " gap-1 px-2.5 sm:pr-2.5" +
                    (currentPage === numPages
                      ? " pointer-events-none opacity-50"
                      : "")
                  }
                  aria-label="Go to next page"
                  aria-disabled={currentPage === numPages}
                  resetScroll={false}
                >
                  <span className="hidden sm:block">Next</span>
                  <ChevronRightIcon />
                </Link>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div>
  );
}
