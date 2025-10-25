import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Header } from "@workspace/ui/components/header";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@workspace/ui/components/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { getFirstTextContent, safeParseJSON } from "@workspace/ui/lib/tiptap";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  createStandardSchemaV1,
  parseAsInteger,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import { fetchClient } from "~/lib/live-state";

const searchParams = {
  page: parseAsInteger.withDefault(1),
  order: parseAsStringEnum(["createdAt", "updatedAt"]).withDefault("createdAt"),
};

type ThreadsSearchOrderOptions = "createdAt" | "updatedAt";

export const Route = createFileRoute("/support/$slug/threads/")({
  component: RouteComponent,

  validateSearch: createStandardSchemaV1(searchParams, {
    partialOutput: true,
  }),

  loader: async ({ params }) => {
    const { slug } = params;
    // FIXME: Replace where by first when new version of live-state is out
    const organization = (
      await fetchClient.query.organization.where({ slug: slug }).get()
    )[0];

    if (!organization) {
      throw notFound();
    }

    // TODO Deep include thread messages and assigned user when live-state supports it
    // TODO reverse sort messages by createdAt
    const threads = await fetchClient.query.thread
      .where({
        organizationId: organization.id,
      })
      .include({ messages: true, assignedUser: true })
      .get();

    return {
      organization: organization as typeof organization | undefined,
      threads: threads as typeof threads | undefined,
    };
  },
});

const THREADS_PER_PAGE = 10;

function RouteComponent() {
  const organization = Route.useLoaderData().organization;
  const threads = Route.useLoaderData().threads;
  const [{ page, order }, setSearchParams] = useQueryStates(searchParams);

  // TODO: Update URL to reflect real organization discord link
  const integrationPaths = { discord: "https://discord.com/invite/acme" };

  const orderByOptions: { label: string; value: ThreadsSearchOrderOptions }[] =
    [
      { label: "Created", value: "createdAt" },
      { label: "Last message", value: "updatedAt" },
    ];

  const handleSortChange = (value: ThreadsSearchOrderOptions) => {
    setSearchParams({ order: value });
  };

  const orderedThreads = [...(threads ?? [])].sort((a, b) => {
    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;

    switch (order) {
      case "createdAt":
        return bDate - aDate;
      case "updatedAt":
        return aDate - bDate;
      default:
        return bDate - aDate;
    }
  });

  const numPages = orderedThreads
    ? Math.ceil(orderedThreads?.length / THREADS_PER_PAGE)
    : 1;

  const currentPage = page ?? 1;

  const startIdx = THREADS_PER_PAGE * (currentPage - 1);
  const endIdx = THREADS_PER_PAGE * currentPage;

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
    <div className="w-full">
      <Header />
      <div className="flex flex-col max-w-5xl gap-8 mx-auto py-8">
        <div className="flex items-center gap-6">
          <Avatar
            variant="org"
            size="xxl"
            src={organization?.logoUrl}
            fallback={organization?.name}
          />
          <div className="flex justify-between w-full">
            <h1 className="font-bold text-3xl">{organization?.name}</h1>
            <Button size="lg" externalLink asChild>
              <a
                href={integrationPaths.discord}
                target="_blank"
                rel="noreferrer"
              >
                Join Discord
              </a>
            </Button>
          </div>
        </div>
        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle className="gap-4">Threads</CardTitle>
            <CardAction side="right">
              <Select
                value={order}
                onValueChange={(value) =>
                  handleSortChange(value as ThreadsSearchOrderOptions)
                }
                items={orderByOptions}
              >
                <SelectTrigger className="w-32" data-size="sm">
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
            </CardAction>
          </CardHeader>
          <CardContent className="overflow-y-auto gap-0 items-center">
            {threadsInPage?.map((thread) => (
              <Link
                key={thread.id}
                to={"/support/$slug/threads/$id"}
                params={{ slug: organization.slug, id: thread.id }}
                className="w-full max-w-5xl flex flex-col p-3 gap-2 hover:bg-muted"
              >
                <div className="flex justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar variant="user" size="md" fallback={"P"} />
                    <div>{thread?.name}</div>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    <span className="font-medium">
                      {/* TODO update when live-state supports deep includes */}
                      {/* {thread?.messages?.[thread?.messages?.length - 1]?.author?.name} */}
                      Author:&nbsp;
                    </span>
                    <span className="truncate">
                      {getFirstTextContent(
                        safeParseJSON(
                          thread?.messages?.[thread?.messages?.length - 1]
                            ?.content ?? "",
                        ),
                      )}
                    </span>
                  </span>
                  <div className="text-muted-foreground">
                    {thread?.createdAt
                      ? formatRelativeTime(thread?.createdAt as Date)
                      : null}
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <Link
                to="."
                search={{ page: currentPage - 1 }}
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
                    search={{ page: pageNum }}
                    aria-current={page === pageNum ? "page" : undefined}
                    className={buttonVariants({
                      variant: page === pageNum ? "outline" : "ghost",
                      size: "icon",
                    })}
                  >
                    {pageNum}
                  </Link>
                </PaginationItem>
              );
            })}
            <PaginationItem>
              <Link
                to="."
                search={{ page: currentPage + 1 }}
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
              >
                <span className="hidden sm:block">Next</span>
                <ChevronRightIcon />
              </Link>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
