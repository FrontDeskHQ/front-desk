import type { InferLiveObject } from "@live-state/sync";
import { useLiveQuery } from "@live-state/sync/client";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import {
  Filter,
  type FilterOptions,
  type FilterValue,
} from "@workspace/ui/components/blocks/filter";
import { Button } from "@workspace/ui/components/button";
import {
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  PriorityIndicator,
  priorityText,
  StatusIndicator,
  statusValues,
} from "@workspace/ui/components/indicator";
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
import type { schema } from "api/schema";
import { useAtomValue } from "jotai/react";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CircleUser,
  Settings2,
} from "lucide-react";
import { useState } from "react";
import { CreateThread } from "~/components/devtools/create-thread";
import { activeOrganizationAtom } from "~/lib/atoms";
import { query } from "~/lib/live-state";

export const Route = createFileRoute("/app/_workspace/_main/threads/")({
  component: RouteComponent,
});

export const ListItem = ({ threadId }: { threadId: string }) => {
  // TODO reverse sort messages by createdAt
  const thread = useLiveQuery(
    query.thread.one(threadId).include({
      messages: true,
      assignedUser: true,
    }),
  );

  return (
    <Link
      to={"/app/threads/$id"}
      params={{ id: threadId }}
      className="w-full max-w-5xl flex flex-col p-3 gap-2 hover:bg-muted"
    >
      <div className="flex justify-between">
        <div className="flex items-center gap-2">
          <Avatar variant="user" size="md" fallback={"P"} />
          <div>{thread?.name}</div>
        </div>
        <div className="flex items-center gap-2">
          {thread?.assignedUser ? (
            <Avatar
              variant="user"
              size="md"
              fallback={thread.assignedUser.name}
            />
          ) : (
            <CircleUser className="size-4" />
          )}
          <PriorityIndicator priority={thread?.priority ?? 0} />
          <StatusIndicator status={thread?.status ?? 0} />
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
                thread?.messages?.[thread?.messages?.length - 1]?.content ?? "",
              ),
            )}
          </span>
        </span>
        <div className="text-muted-foreground">
          {formatRelativeTime(thread?.createdAt as Date)}
        </div>
      </div>
    </Link>
  );
};

const orderByOptions = [
  { label: "Created", value: "createdAt" },
  { label: "Last message", value: "updatedAt" }, // TODO fix when live-state supports deep sorting
  { label: "Priority", value: "priority" },
  { label: "Status", value: "status" },
];

function RouteComponent() {
  const currentOrg = useAtomValue(activeOrganizationAtom);

  const organizationUsers = useLiveQuery(
    query.organizationUser
      .where({ organizationId: currentOrg?.id })
      .include({ user: true }),
  );

  const [filter, setFilter] = useState<FilterValue>({});

  let threadsQuery = query.thread.where({
    organizationId: currentOrg?.id,
  });

  if (filter && Object.keys(filter).some((key) => filter[key]?.length > 0)) {
    threadsQuery = threadsQuery.where(
      Object.fromEntries(
        Object.entries(filter).map(([key, values]) => [key, { $in: values }]),
      ),
    );
  }

  const filterOptions: FilterOptions = {
    status: {
      label: "Status",
      key: "status",
      icon: <StatusIndicator status={0} />,
      options: Object.entries(statusValues).map(([statusKey, value]) => {
        const status = Number(statusKey);
        return {
          label: value.label,
          value: status,
          icon: <StatusIndicator status={status} />,
        };
      }),
    },
    priority: {
      label: "Priority",
      key: "priority",
      icon: <PriorityIndicator priority={2} />,
      options: Object.entries(priorityText).map(([priorityKey, value]) => {
        const priority = Number(priorityKey);
        return {
          label: value,
          value: priority,
          icon: <PriorityIndicator priority={priority} />,
        };
      }),
    },
    assignedUserId: {
      label: "Assigned User",
      key: "assignedUserId",
      icon: <CircleUser className="size-4" />,
      options: (organizationUsers ?? []).map((user) => ({
        label: user.user.name,
        value: user.userId,
        icon: <Avatar variant="user" size="md" fallback={user.user.name} />,
      })),
    },
  };

  const [orderBy, setOrderBy] = useState<string>("createdAt");
  const [orderDirection, setOrderDirection] = useState<"asc" | "desc">("asc");

  // TODO Deep include thread messages and assigned user when live-state supports it
  const threads = useLiveQuery(
    threadsQuery.orderBy(
      orderBy as keyof InferLiveObject<typeof schema.thread>,
      orderDirection,
    ),
  );

  return (
    <>
      <CardHeader>
        <CardTitle className="gap-4">Threads</CardTitle>
        <CardAction side="right">
          <Filter
            options={filterOptions}
            value={filter}
            onValueChange={setFilter}
          />
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
        {threads?.map((thread) => (
          <ListItem key={thread.id} threadId={thread.id} />
        ))}
      </CardContent>
      {import.meta.env.MODE === "development" && (
        <CardFooter>
          <CreateThread />
        </CardFooter>
      )}
    </>
  );
}
