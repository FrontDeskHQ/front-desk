import { useLiveQuery } from "@live-state/sync/client";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { InputBox, RichText } from "@workspace/ui/components/blocks/tiptap";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  type BaseItem,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@workspace/ui/components/combobox";
import {
  PriorityIndicator,
  PriorityText,
  StatusIndicator,
  StatusText,
  statusValues,
} from "@workspace/ui/components/indicator";
import { SidebarMenuButton } from "@workspace/ui/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { useAutoScroll } from "@workspace/ui/hooks/use-auto-scroll";
import { safeParseJSON } from "@workspace/ui/lib/tiptap";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";
import { CircleUser } from "lucide-react";
import { ulid } from "ulid";
import { mutate, query } from "~/lib/live-state";

export const Route = createFileRoute("/app/_workspace/_main/threads/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  const { user } = getRouteApi("/app").useRouteContext();
  const { id } = Route.useParams();

  const thread = useLiveQuery(
    query.thread.where({ id }).include({
      organization: true,
      messages: { author: true },
      assignedUser: true,
    }),
  )?.[0];

  const organizationUsers = useLiveQuery(
    query.organizationUser
      .where({ organizationId: thread?.organizationId })
      .include({ user: true }),
  );

  const { scrollRef, disableAutoScroll } = useAutoScroll({
    smooth: false,
    content: (thread as any)?.messages,
    offset: 264,
  });

  return (
    <div className="flex size-full">
      <div className="flex-1 flex flex-col">
        <CardHeader>
          <CardTitle>
            {" "}
            {thread && (
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to="/app/threads">Threads</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild className="text-white">
                      <Link to="/app/threads/$id" params={{ id: id }}>
                        {thread.name}
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            )}
          </CardTitle>
        </CardHeader>
        <div className="flex flex-col p-4 gap-4 flex-1 w-full max-w-5xl mx-auto overflow-hidden">
          <div
            className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto"
            ref={scrollRef}
            onScroll={disableAutoScroll}
            onTouchMove={disableAutoScroll}
          >
            {(thread as any)?.messages
              .sort((a: any, b: any) => a.id.localeCompare(b.id))
              .map((message: any) => (
                <Card
                  key={message.id}
                  className={cn(
                    "relative before:w-[1px] before:h-4 before:left-4 before:absolute before:-top-4 not-first:before:bg-border",
                    message?.author?.userId === user.id &&
                      "border-[#2662D9]/20",
                  )}
                >
                  <CardHeader
                    size="sm"
                    className={cn(
                      message?.author?.userId === user.id &&
                        "bg-[#2662D9]/15 border-[#2662D9]/20",
                    )}
                  >
                    <CardTitle>
                      <Avatar
                        variant="user"
                        size="md"
                        fallback={message.author.name}
                      />
                      <p>{message.author.name}</p>
                      <p className="text-muted-foreground">
                        {formatRelativeTime(message.createdAt as Date)}
                      </p>
                      {message.origin === "discord" && (
                        <>
                          <span className="bg-muted-foreground size-0.75 rounded-full" />
                          <p className="text-muted-foreground">
                            Imported from Discord
                          </p>
                        </>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RichText content={safeParseJSON(message.content)} />
                  </CardContent>
                </Card>
              ))}
          </div>
          <InputBox
            className="bottom-2.5 w-full shadow-lg bg-[#1B1B1E]"
            onSubmit={(value) => {
              const author = query.author.first({ userId: user.id }).get();
              let authorId = author?.id;

              if (!authorId) {
                authorId = ulid().toLowerCase();

                mutate.author.insert({
                  id: authorId,
                  userId: user.id,
                  metaId: null,
                  name: user.name,
                });
              }

              mutate.message.insert({
                id: ulid().toLowerCase(),
                authorId: authorId,
                content: JSON.stringify(value),
                threadId: id,
                createdAt: new Date(),
                origin: null,
                externalMessageId: null,
              });
            }}
          />
        </div>
      </div>
      <div className="w-64 border-l bg-muted/25 flex flex-col p-4 gap-4">
        <TooltipProvider>
          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground text-xs">Properties</div>
            <div className="flex flex-col gap-1.5">
              <Tooltip>
                <Combobox
                  items={Object.entries(statusValues).map(([key, value]) => ({
                    value: key,
                    label: value.label,
                  }))}
                  value={thread?.status ?? 0}
                  onValueChange={(value) => {
                    mutate.thread.update(id, {
                      status: +value,
                    });
                  }}
                >
                  <ComboboxTrigger
                    variant="unstyled"
                    render={
                      <TooltipTrigger
                        render={
                          <SidebarMenuButton
                            size="sm"
                            className="text-sm px-1.5 max-w-40 py-1"
                          >
                            <StatusIndicator status={thread?.status ?? 0} />
                            <StatusText status={thread?.status ?? 0} />
                          </SidebarMenuButton>
                        }
                      />
                    }
                  />

                  <ComboboxContent className="w-48">
                    <ComboboxInput placeholder="Search..." />
                    <ComboboxEmpty />
                    <ComboboxList>
                      {(item: BaseItem) => (
                        <ComboboxItem key={item.value} value={item.value}>
                          <StatusIndicator status={+item.value} />
                          {item.label}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                <TooltipContent>
                  Change priority
                  {/* TODO add keyboard shortcut */}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <Combobox
                  items={[
                    {
                      value: 0,
                      label: "No priority",
                    },
                    {
                      value: 1,
                      label: "Low priority",
                    },
                    {
                      value: 2,
                      label: "Medium priority",
                    },
                    {
                      value: 3,
                      label: "High priority",
                    },
                  ]}
                  value={thread?.priority}
                  onValueChange={(value) => {
                    mutate.thread.update(id, {
                      priority: +value,
                    });
                  }}
                >
                  <ComboboxTrigger
                    variant="unstyled"
                    render={
                      <TooltipTrigger
                        render={
                          <SidebarMenuButton
                            size="sm"
                            className="text-sm px-1.5 max-w-40 py-1"
                          >
                            <PriorityIndicator
                              priority={thread?.priority ?? 0}
                            />
                            <PriorityText priority={thread?.priority ?? 0} />
                          </SidebarMenuButton>
                        }
                      />
                    }
                  />

                  <ComboboxContent className="w-48">
                    <ComboboxInput placeholder="Search..." />
                    <ComboboxEmpty />
                    <ComboboxList>
                      {(item: BaseItem) => (
                        <ComboboxItem key={item.value} value={item.value}>
                          <PriorityIndicator priority={+item.value} />
                          {item.label}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                <TooltipContent>
                  Change priority
                  {/* TODO add keyboard shortcut */}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <Combobox
                  items={[
                    {
                      value: null,
                      label: "Unassigned",
                    },
                    ...(organizationUsers?.map((user) => ({
                      value: user.userId,
                      label: user.user.name,
                    })) ?? []),
                  ]}
                  value={thread?.assignedUser?.id}
                  onValueChange={(value) => {
                    mutate.thread.update(id, {
                      assignedUserId: value,
                    });
                  }}
                >
                  <ComboboxTrigger
                    variant="unstyled"
                    render={
                      <TooltipTrigger
                        render={
                          <SidebarMenuButton
                            size="sm"
                            className={cn(
                              "text-sm px-1.5 max-w-40 py-1 text-muted-foreground",
                              thread?.assignedUser?.name && "text-primary",
                            )}
                          >
                            {thread?.assignedUser ? (
                              <Avatar
                                variant="user"
                                size="md"
                                fallback={thread?.assignedUser.name}
                              />
                            ) : (
                              <CircleUser className="mx-0.5" />
                            )}
                            {thread?.assignedUser?.name ?? "Unassigned"}
                          </SidebarMenuButton>
                        }
                      />
                    }
                  />

                  <ComboboxContent className="w-48">
                    <ComboboxInput placeholder="Search..." />
                    <ComboboxEmpty />
                    <ComboboxList>
                      {(item: BaseItem) => (
                        <ComboboxItem key={item.value} value={item.value}>
                          {item.value ? (
                            <Avatar
                              variant="user"
                              size="md"
                              fallback={item.label}
                            />
                          ) : (
                            <CircleUser className="mx-0.5" />
                          )}
                          {item.label}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                <TooltipContent>
                  Assign to
                  {/* TODO add keyboard shortcut */}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}
