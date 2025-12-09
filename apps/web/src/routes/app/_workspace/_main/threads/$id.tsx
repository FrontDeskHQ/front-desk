("use client");

import { useLiveQuery } from "@live-state/sync/client";
import {
  createFileRoute,
  getRouteApi,
  Link,
  notFound,
  useNavigate,
} from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { InputBox, RichText } from "@workspace/ui/components/blocks/tiptap";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { ActionButton, Button } from "@workspace/ui/components/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
  PriorityIndicator,
  PriorityText,
  StatusIndicator,
  StatusText,
  statusValues,
} from "@workspace/ui/components/indicator";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { useAutoScroll } from "@workspace/ui/hooks/use-auto-scroll";
import { safeParseJSON } from "@workspace/ui/lib/tiptap";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";
import { CircleUser, Copy, MoreHorizontalIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ulid } from "ulid";
import { Update } from "~/components/threads/updates";
import { fetchClient, mutate, query } from "~/lib/live-state";
import { seo } from "~/utils/seo";
import { calculateDeletionDate, DAYS_UNTIL_DELETION } from "~/utils/thread";

export const Route = createFileRoute("/app/_workspace/_main/threads/$id")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const { id } = params;
    const thread = (
      await fetchClient.query.thread
        .where({ id })
        .include({
          organization: true,
          author: true,
          messages: { author: true },
          updates: true,
        })
        .get()
    )[0];

    if (!thread) {
      throw notFound();
    }

    return { thread };
  },
  head: ({ loaderData }) => {
    const thread = loaderData?.thread;
    const threadName = thread?.name ?? "Thread";
    return {
      meta: [
        ...seo({
          title: `${threadName} - Threads - FrontDesk`,
          description: `Support thread: ${threadName}`,
        }),
      ],
    };
  },
});

function RouteComponent() {
  const { user } = getRouteApi("/app").useRouteContext();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const thread = useLiveQuery(
    query.thread.where({ id }).include({
      organization: true,
      messages: { author: true },
      assignedUser: true,
      updates: { user: true },
    }),
  )?.[0];

  const organizationUsers = useLiveQuery(
    query.organizationUser
      .where({ organizationId: thread?.organizationId })
      .include({ user: true }),
  );

  const allItems = thread
    ? [
        ...(thread?.messages ?? []).map((msg) => ({
          ...msg,
          itemType: "message" as const,
        })),
        ...(thread?.updates ?? []).map((update) => ({
          ...update,
          itemType: "update" as const,
        })),
      ].sort((a, b) => a.id.localeCompare(b.id))
    : [];

  const { scrollRef, disableAutoScroll } = useAutoScroll({
    smooth: false,
    content: allItems,
    offset: 264,
  });

  const copyLinkToClipboard = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  const deleteThread = () => {
    mutate.thread.update(id, {
      deletedAt: calculateDeletionDate(),
    });
    setShowDeleteDialog(false);
    toast.success(`Thread will be deleted after ${DAYS_UNTIL_DELETION} days`, {
      duration: 10000,
      action: {
        label: "See list",
        onClick: () => navigate({ to: "/app/threads/archive" }),
      },
      actionButtonStyle: {
        background: "transparent",
        color: "hsl(var(--primary))",
        border: "none",
        textDecoration: "underline",
      },
    });
    navigate({ to: "/app/threads" });
  };

  return (
    <div className="flex size-full">
      <div className="flex-1 flex flex-col">
        <CardHeader>
          <CardTitle>
            {" "}
            {thread && (
              <div className="flex justify-between items-center w-full">
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
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" aria-label="Open menu" size="sm">
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-40" align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuItem onSelect={() => copyLinkToClipboard()}>
                        <Copy />
                        Copy link
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setShowDeleteDialog(true)}
                      >
                        <Trash2 />
                        Delete thread
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Dialog
                  open={showDeleteDialog}
                  onOpenChange={setShowDeleteDialog}
                >
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Delete Thread</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to delete the thread "
                        {thread?.name}"?
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        type="submit"
                        variant="destructive"
                        onClick={() => {
                          deleteThread();
                        }}
                      >
                        Delete
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
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
            {allItems.map((item) => {
              if (item.itemType === "message") {
                return (
                  <Card
                    key={item.id}
                    className={cn(
                      "relative before:w-[1px] before:h-4 before:left-4 before:absolute before:-top-4 not-first:before:bg-border",
                      item?.author?.userId === user.id && "border-[#2662D9]/20",
                    )}
                  >
                    <CardHeader
                      size="sm"
                      className={cn(
                        item?.author?.userId === user.id &&
                          "bg-[#2662D9]/15 border-[#2662D9]/20",
                      )}
                    >
                      <CardTitle>
                        <Avatar
                          variant="user"
                          size="md"
                          fallback={item.author.name}
                        />
                        <p>{item.author.name}</p>
                        <p className="text-muted-foreground">
                          {formatRelativeTime(item.createdAt as Date)}
                        </p>
                        {item.origin === "discord" && (
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
                      <RichText content={safeParseJSON(item.content)} />
                    </CardContent>
                  </Card>
                );
              }

              if (item.itemType === "update") {
                return <Update key={item.id} update={item} user={user} />;
              }

              return null;
            })}
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
                  organizationId: thread?.organizationId,
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
              <Combobox
                items={Object.entries(statusValues).map(([key, value]) => ({
                  value: key,
                  label: value.label,
                }))}
                value={thread?.status ?? 0}
                onValueChange={(value) => {
                  const oldStatus = thread?.status ?? 0;
                  const newStatus = +value;
                  const oldStatusLabel =
                    statusValues[oldStatus]?.label ?? "Unknown";
                  const newStatusLabel =
                    statusValues[newStatus]?.label ?? "Unknown";

                  mutate.thread.update(id, {
                    status: newStatus,
                  });

                  mutate.update.insert({
                    id: ulid().toLowerCase(),
                    threadId: id,
                    type: "status_changed",
                    createdAt: new Date(),
                    userId: user.id,
                    metadataStr: JSON.stringify({
                      oldStatus,
                      newStatus,
                      oldStatusLabel,
                      newStatusLabel,
                      userName: user.name,
                    }),
                    replicatedStr: JSON.stringify({}),
                  });
                }}
              >
                <ComboboxTrigger
                  variant="unstyled"
                  render={
                    <ActionButton
                      variant="ghost"
                      size="sm"
                      className="text-sm px-1.5 max-w-40 py-1 w-full justify-start"
                      tooltip="Change status"
                      keybind="s"
                    >
                      <div className="flex items-center justify-center size-4">
                        <StatusIndicator status={thread?.status ?? 0} />
                      </div>
                      <StatusText status={thread?.status ?? 0} />
                    </ActionButton>
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
                  const oldPriority = thread?.priority ?? 0;
                  const newPriority = +value;
                  const priorityLabels: Record<number, string> = {
                    0: "No priority",
                    1: "Low priority",
                    2: "Medium priority",
                    3: "High priority",
                  };
                  const oldPriorityLabel =
                    priorityLabels[oldPriority] ?? "Unknown";
                  const newPriorityLabel =
                    priorityLabels[newPriority] ?? "Unknown";

                  mutate.thread.update(id, {
                    priority: newPriority,
                  });

                  mutate.update.insert({
                    id: ulid().toLowerCase(),
                    threadId: id,
                    type: "priority_changed",
                    createdAt: new Date(),
                    userId: user.id,
                    metadataStr: JSON.stringify({
                      oldPriority,
                      newPriority,
                      oldPriorityLabel,
                      newPriorityLabel,
                      userName: user.name,
                    }),
                    replicatedStr: JSON.stringify({}),
                  });
                }}
              >
                <ComboboxTrigger
                  variant="unstyled"
                  render={
                    <ActionButton
                      variant="ghost"
                      size="sm"
                      className="text-sm px-1.5 max-w-40 py-1 w-full justify-start"
                      tooltip="Change priority"
                      keybind="p"
                    >
                      <div className="flex items-center justify-center size-4">
                        <PriorityIndicator priority={thread?.priority ?? 0} />
                      </div>
                      <PriorityText priority={thread?.priority ?? 0} />
                    </ActionButton>
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
                  const oldAssignedUserId = thread?.assignedUser?.id ?? null;
                  const oldAssignedUserName =
                    thread?.assignedUser?.name ?? null;
                  const newAssignedUserId = value;
                  const newAssignedUser = organizationUsers?.find(
                    (ou) => ou.userId === value,
                  );
                  const newAssignedUserName =
                    newAssignedUser?.user.name ?? null;

                  mutate.thread.update(id, {
                    assignedUserId: value,
                  });

                  mutate.update.insert({
                    id: ulid().toLowerCase(),
                    threadId: id,
                    userId: user.id,
                    type: "assigned_changed",
                    createdAt: new Date(),
                    metadataStr: JSON.stringify({
                      oldAssignedUserId,
                      newAssignedUserId,
                      oldAssignedUserName,
                      newAssignedUserName,
                      userName: user.name,
                    }),
                    replicatedStr: JSON.stringify({}),
                  });
                }}
              >
                <ComboboxTrigger
                  variant="unstyled"
                  render={
                    <ActionButton
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "text-sm px-1.5 max-w-40 py-1 w-full justify-start text-muted-foreground",
                        thread?.assignedUser?.name && "text-primary",
                      )}
                      tooltip="Assign to"
                      keybind="a"
                    >
                      <div className="flex items-center justify-center size-4">
                        {thread?.assignedUser ? (
                          <Avatar
                            variant="user"
                            size="md"
                            fallback={thread?.assignedUser.name}
                          />
                        ) : (
                          <CircleUser className="size-4" />
                        )}
                      </div>
                      {thread?.assignedUser?.name ?? "Unassigned"}
                    </ActionButton>
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
            </div>
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}
