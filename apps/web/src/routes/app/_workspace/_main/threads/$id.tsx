("use client");

import type { InferLiveObject } from "@live-state/sync";
import { useLiveQuery } from "@live-state/sync/client";
import { useFlag } from "@reflag/react-sdk";
import {
  createFileRoute,
  getRouteApi,
  Link,
  notFound,
  useNavigate,
} from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import {
  Editor,
  EditorInput,
  EditorSubmit,
  RichText,
} from "@workspace/ui/components/blocks/tiptap";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
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
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { useAutoScroll } from "@workspace/ui/hooks/use-auto-scroll";
import { safeParseJSON } from "@workspace/ui/lib/tiptap";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";
import type { schema } from "api/schema";
import { Copy, MoreHorizontalIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ulid } from "ulid";
import { IssuesSection } from "~/components/threads/issues";
import { LabelsSection } from "~/components/threads/labels";
import { PropertiesSection } from "~/components/threads/properties";
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
  const { isEnabled: isGithubIntegrationEnabled } =
    useFlag("github-integration");

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
          <Editor
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
          >
            <EditorInput
              className="bottom-2.5 w-full shadow-lg bg-[#1B1B1E]"
              placeholder="Write a reply..."
            >
              <EditorSubmit />
            </EditorInput>
          </Editor>
        </div>
      </div>
      <div className="w-64 border-l bg-muted/25 flex flex-col p-4 gap-4">
        <TooltipProvider>
          <div className="flex flex-col gap-2">
            <PropertiesSection
              thread={thread}
              id={id}
              organizationUsers={organizationUsers}
              user={user as InferLiveObject<typeof schema.user>}
            />
            <LabelsSection threadId={id} />
            {isGithubIntegrationEnabled && (
              <IssuesSection
                threadId={id}
                user={user}
                externalIssueId={thread?.externalIssueId ?? null}
                threadName={thread?.name}
              />
            )}
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}
