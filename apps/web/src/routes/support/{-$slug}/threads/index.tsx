import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
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
  PaginationLink,
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
import { useState } from "react";
import { fetchClient } from "~/lib/live-state";

export const Route = createFileRoute("/support/{-$slug}/threads/")({
  component: RouteComponent,

  loader: async ({ params }) => {
    const { slug } = params;
    // FIXME: Replace where by first when new version of live-state is out
    const organization = (
      await fetchClient.query.organization
        .where({ slug: slug })
        .include({ threads: true })
        .get()
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

function RouteComponent() {
  const organization = Route.useLoaderData().organization;
  const threads = Route.useLoaderData().threads;

  // TODO: Update URL to reflect real organization discord link
  const integrationPaths = { discord: "https://discord.com/invite/acme" };

  const orderByOptions = [
    { label: "Created", value: "createdAt" },
    { label: "Last message", value: "updatedAt" }, // TODO fix when live-state supports deep sorting
  ];

  const [orderBy, setOrderBy] = useState<string>("createdAt");
  const [orderDirection, setOrderDirection] = useState<"asc" | "desc">("asc");

  const sortedThreads = [...(threads ?? [])].sort((a, b) => {
    const aValue = a[orderBy as keyof typeof a] ?? -Infinity;
    const bValue = b[orderBy as keyof typeof b] ?? -Infinity;
    return orderDirection === "asc"
      ? aValue > bValue
        ? 1
        : -1
      : aValue < bValue
        ? 1
        : -1;
  });

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
              {/* TODO: Implement search functionality when live-state supports full text search */}
              {/* <Search placeholder="Search" /> */}
              <Popover>
                <PopoverTrigger>
                  <Button variant="ghost" size="sm">
                    <Settings2 />
                    Display
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="p-4 flex flex-col gap-4"
                  positionerProps={{ align: "end" }}
                >
                  <div className="flex w-full items-center gap-2">
                    <div className="mr-auto">Order by</div>
                    <Select
                      value={orderBy}
                      onValueChange={(value) => setOrderBy(value as string)}
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
                              setOrderDirection(
                                orderDirection === "asc" ? "desc" : "asc",
                              )
                            }
                            className="size-8"
                          >
                            {orderDirection === "asc" ? (
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
            {sortedThreads?.map((thread) => (
              <Link
                key={thread.id}
                to={"/app/threads/$id"}
                params={{ id: thread.id }}
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
              <PaginationPrevious href="#" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">1</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive>
                2
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">3</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
