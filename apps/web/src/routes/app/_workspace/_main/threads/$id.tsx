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
  RichText,
  TruncatedText,
} from "@workspace/ui/components/blocks/tiptap";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { ActionButton, Button } from "@workspace/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
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
import {
  ArrowDown,
  Check,
  Copy,
  MoreHorizontalIcon,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { IssuesSection } from "~/components/threads/issues";
import { LabelsSection } from "~/components/threads/labels";
import { PropertiesSection } from "~/components/threads/properties";
import { PullRequestsSection } from "~/components/threads/pull-requests";
import { ThreadInputArea } from "~/components/threads/thread-input-area";
import { Update } from "~/components/threads/updates";
import { ThreadCommands } from "~/lib/commands/commands/thread";
import { useThreadAnalytics } from "~/lib/hooks/use-thread-analytics";
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
  const [highlightAnswer, setHighlightAnswer] = useState(false);

  useEffect(() => {
    const checkHash = () => {
      const hasHash = window.location.hash === "#answer-message";
      setHighlightAnswer(hasHash);

      if (hasHash) {
        setHighlightAnswer(true);
      }
    };

    checkHash();
    window.addEventListener("hashchange", checkHash);

    return () => {
      window.removeEventListener("hashchange", checkHash);
    };
  }, []);

  const thread = useLiveQuery(
    query.thread.where({ id }).include({
      organization: true,
      messages: { author: true },
      assignedUser: true,
      updates: { user: true },
    }),
  )?.[0];

  const { captureThreadEvent } = useThreadAnalytics(thread);

  const { isEnabled: isGithubIntegrationEnabled } =
    useFlag("github-integration");

  const organizationUsers = useLiveQuery(
    query.organizationUser
      .where({ organizationId: thread?.organizationId })
      .include({ user: true }),
  );

  const threadLabels = useLiveQuery(
    query.threadLabel
      .where({
        threadId: id,
        enabled: true,
        label: { enabled: true },
      })
      .include({ label: true }),
  );

  const allItems = thread
    ? [
        ...(thread?.messages ?? []).map((msg: any) => ({
          ...msg,
          itemType: "message" as const,
        })),
        ...(thread?.updates ?? []).map((update: any) => ({
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
    captureThreadEvent("thread:link_copy");
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
    captureThreadEvent("thread:thread_delete");
    navigate({ to: "/app/threads" });
  };

  const answerMessage = thread?.messages.find(
    (message) => message.markedAsAnswer,
  );

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (highlightAnswer) {
      timeoutId = setTimeout(() => {
        setHighlightAnswer(false);
      }, 5000);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [highlightAnswer]);

  return (
    <>
      <ThreadCommands threadId={id} />
      <div className="flex size-full">
        <div className="flex-1 flex flex-col">
          <CardHeader>
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
                      <BreadcrumbPage>{thread.name}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      aria-label="Open menu"
                      size="sm"
                      className="ml-auto"
                    >
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
          </CardHeader>
          <div className="flex flex-col p-4 gap-4 flex-1 w-full max-w-5xl mx-auto overflow-hidden">
            <div
              className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto"
              ref={scrollRef}
              onScroll={disableAutoScroll}
              onTouchMove={disableAutoScroll}
            >
              {allItems.map((item, i) => {
                if (item.itemType === "message") {
                  return (
                    <TooltipProvider key={item.id}>
                      <Card
                        className={cn(
                          "relative before:w-px before:h-4 before:left-4 before:absolute before:-top-4 not-first:before:bg-border group transition-[color,box-shadow] data-[highlight=true]:border-ring data-[highlight=true]:ring-ring/50 data-[highlight=true]:ring-[3px]",
                          item?.author?.userId === user.id &&
                            "border-[#2662D9]/20",
                          item.markedAsAnswer && "border-green-700/30",
                        )}
                        data-highlight={item.markedAsAnswer && highlightAnswer}
                        id={item.markedAsAnswer ? "answer-message" : undefined}
                      >
                        <CardHeader
                          size="sm"
                          className={cn(
                            "px-2",
                            item?.author?.userId === user.id &&
                              "bg-[#2662D9]/15 border-[#2662D9]/20",
                            item.markedAsAnswer &&
                              "bg-green-800/10 border-green-700/30",
                          )}
                        >
                          <CardTitle>
                            <Avatar
                              variant="user"
                              size="md"
                              fallback={item.author.name}
                            />
                            <p>{item.author.name}</p>
                            <p className="text-foreground-secondary">
                              {formatRelativeTime(item.createdAt as Date)}
                            </p>
                            {item.origin === "discord" && (
                              <>
                                <span className="bg-muted-foreground size-0.75 rounded-full" />
                                <p className="text-foreground-secondary">
                                  Imported from Discord
                                </p>
                              </>
                            )}
                            {item.markedAsAnswer && (
                              <>
                                <span className="bg-muted-foreground size-0.75 rounded-full" />
                                <Check className="size-3.5" />
                                <p className="text-foreground-secondary">
                                  Marked as answer
                                </p>
                              </>
                            )}
                          </CardTitle>
                          {i > 0 && !answerMessage && (
                            <CardAction
                              side="right"
                              className="hidden group-hover:flex"
                            >
                              <ActionButton
                                variant="ghost"
                                size="icon-sm"
                                tooltip="Mark as answer"
                                onClick={() => {
                                  mutate.message.markAsAnswer({
                                    messageId: item.id,
                                  });
                                }}
                              >
                                <Check />
                              </ActionButton>
                            </CardAction>
                          )}
                        </CardHeader>
                        <CardContent
                          className={cn(i === 0 && answerMessage && "border-b")}
                        >
                          <RichText content={safeParseJSON(item.content)} />
                        </CardContent>
                        {i === 0 && answerMessage && (
                          <CardFooter className="flex-col items-start p-4 gap-2 bg-green-800/15 border-t-0">
                            <div className="text-xs flex items-center gap-2">
                              <Check className="size-3.5" /> Answered by{" "}
                              {answerMessage.author.name}
                              <p className="text-foreground-secondary">
                                {formatRelativeTime(
                                  answerMessage.createdAt as Date,
                                )}
                              </p>
                            </div>
                            <TruncatedText maxHeight={64} hideShowMore>
                              <RichText
                                content={safeParseJSON(answerMessage.content)}
                              />
                            </TruncatedText>
                            <Button
                              variant="ghost"
                              size="sm"
                              render={
                                <Link
                                  to={`/app/threads/$id`}
                                  params={{ id: thread.id }}
                                  hash="answer-message"
                                  onClick={() => {
                                    setHighlightAnswer(true);
                                  }}
                                />
                              }
                              className="cursor-default"
                            >
                              Go to answer
                              <ArrowDown className="size-3.5" />
                            </Button>
                          </CardFooter>
                        )}
                      </Card>
                    </TooltipProvider>
                  );
                }

                if (item.itemType === "update") {
                  return <Update key={item.id} update={item} user={user} />;
                }

                return null;
              })}
            </div>
            <ThreadInputArea
              threadId={id}
              organizationId={thread?.organizationId}
              threadLabels={threadLabels}
              user={user}
              lastMessageId={allItems[allItems.length - 1]?.id}
              captureThreadEvent={captureThreadEvent}
            />
          </div>
        </div>
        <div className="w-64 border-l bg-muted/25 flex flex-col p-4 gap-4">
          <TooltipProvider>
            <div className="flex flex-col gap-8">
              <PropertiesSection
                thread={thread}
                id={id}
                organizationUsers={organizationUsers}
                user={user as InferLiveObject<typeof schema.user>}
                captureThreadEvent={captureThreadEvent}
              />
              <LabelsSection
                threadId={id}
                captureThreadEvent={captureThreadEvent}
              />
              <div className="flex flex-col gap-2">
                <IssuesSection
                  threadId={id}
                  user={user}
                  externalIssueId={thread?.externalIssueId ?? null}
                  threadName={thread?.name}
                  captureThreadEvent={captureThreadEvent}
                />
                <PullRequestsSection
                  threadId={id}
                  user={user}
                  externalPrId={thread?.externalPrId ?? null}
                  captureThreadEvent={captureThreadEvent}
                />
              </div>
            </div>
          </TooltipProvider>
        </div>
      </div>
    </>
  );
}
