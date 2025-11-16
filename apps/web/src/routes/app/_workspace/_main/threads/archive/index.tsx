import type { InferLiveObject } from "@live-state/sync";
import { useLiveQuery } from "@live-state/sync/client";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import {
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
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
import type { schema } from "api/schema";
import { add } from "date-fns";
import { useAtomValue } from "jotai/react";
import {
  Archive,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Settings2,
} from "lucide-react";
import { useState } from "react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { query } from "~/lib/live-state";
import { DAYS_UNTIL_DELETION, getDaysUntilDeletion } from "~/utils/thread";

export const Route = createFileRoute("/app/_workspace/_main/threads/archive/")({
  component: RouteComponent,
});

function RouteComponent() {
  const currentOrg = useAtomValue(activeOrganizationAtom) || undefined;

  const organization = useLiveQuery(
    query.organization.where({ id: currentOrg?.id }).include({ threads: true }),
  )?.[0];

  //TODO: Add option to sort threads based on expected delete date
  const orderByOptions = [
    { label: "Created", value: "createdAt" },
    { label: "Last message", value: "updatedAt" }, //TODO fix when live-state supports deep sorting
    { label: "Priority", value: "priority" },
    { label: "Status", value: "status" },
  ];

  const threadsQuery = query.thread.where({
    organizationId: organization?.id,
    deletedAt: {
      $not: null,
      $lt: add(new Date(), {
        days: DAYS_UNTIL_DELETION,
      }),
    },
  });

  const [orderBy, setOrderBy] = useState<string>("createdAt");
  const [orderDirection, setOrderDirection] = useState<"asc" | "desc">("desc");

  const threads =
    useLiveQuery(
      threadsQuery
        .include({
          messages: { author: true },
          author: true,
          assignedUser: true,
        })
        .orderBy(
          orderBy as keyof InferLiveObject<typeof schema.thread>,
          orderDirection,
        ),
    ) ?? [];

  if (!organization) {
    return null;
  }

  return (
    <>
      <CardHeader>
        <CardTitle className="gap-4">Archive</CardTitle>
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
      {threads.length > 0 && (
        <div className="w-full text-center pt-4 text-muted-foreground text-sm">
          Threads in archive will be permanently deleted after{" "}
          {DAYS_UNTIL_DELETION} days.
        </div>
      )}
      <CardContent className="overflow-y-auto gap-0 items-center">
        {!threads.length && (
          <div className="text-muted-foreground flex flex-col items-center justify-center gap-4 m-auto">
            <Archive className="size-24 stroke-[0.75]" />
            <div className="text-lg">Nothing in archive</div>
          </div>
        )}
        {threads?.map((thread) => (
          <Link
            key={thread.id}
            to={"/app/threads/archive/$id"}
            params={{ id: thread.id }}
            className="w-full max-w-5xl flex p-3 gap-2 hover:bg-muted items-center"
          >
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Avatar
                  variant="user"
                  size="md"
                  fallback={thread?.author?.name}
                />
                <div>{thread?.name}</div>
              </div>
              <span className="text-muted-foreground min-w-0 text-nowrap font-medium truncate max-w-2xl">
                <span className="font-medium">
                  {
                    thread?.messages?.[thread?.messages?.length - 1]?.author
                      ?.name
                  }
                  :&nbsp;
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
            </div>
            <div className="text-destructive flex-shrink-0">
              {getDaysUntilDeletion(thread.deletedAt)} days left
            </div>
          </Link>
        ))}
      </CardContent>
    </>
  );
}
