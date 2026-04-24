("use client");

import type { InferLiveObject } from "@live-state/sync";
import { useLiveQuery } from "@live-state/sync/client";
import {
  createFileRoute,
  getRouteApi,
  Link,
  notFound,
  useNavigate,
} from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { Button } from "@workspace/ui/components/button";
import { CardHeader } from "@workspace/ui/components/card";
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
import { Separator } from "@workspace/ui/components/separator";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { useAutoScroll } from "@workspace/ui/hooks/use-auto-scroll";
import type { schema } from "api/schema";
import { Copy, MoreHorizontalIcon, Trash2 } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { IssuesSection } from "~/components/threads/issues";
import { LabelsSection } from "~/components/threads/labels";
import { PropertiesSection } from "~/components/threads/properties";
import { PullRequestsSection } from "~/components/threads/pull-requests";
import { RelatedThreadsSection } from "~/components/threads/related-threads-section";
import { ThreadToolbar } from "~/components/threads/thread-toolbar";
import { ThreadCommands } from "~/lib/commands/commands/thread";
import { useThreadAnalytics } from "~/lib/hooks/use-thread-analytics";
import { activeOrganizationAtom } from "~/lib/atoms";
import { mutate, query } from "~/lib/live-state";
import { seo } from "~/utils/seo";
import {
  buildThreadParam,
  calculateDeletionDate,
  DAYS_UNTIL_DELETION,
  parseThreadParam,
} from "~/utils/thread";
import { ThreadHeader } from "./-components/thread-header";
import { ThreadReply } from "./-components/thread-reply";
import { ThreadUpdates } from "./-components/thread-updates";

export const Route = createFileRoute("/app/_workspace/_main/threads/$id/")({
  component: RouteComponent,
  head: () => ({
    meta: [
      ...seo({
        title: "Thread - FrontDesk",
        description: "Support thread",
      }),
    ],
  }),
});

function RouteComponent() {
  const { user } = getRouteApi("/app").useRouteContext();
  const workspaceCtx = getRouteApi("/app/_workspace").useRouteContext();
  const { id: rawParam } = Route.useParams();
  const navigate = useNavigate();
  const activeOrg = useAtomValue(activeOrganizationAtom);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [highlightAnswer, setHighlightAnswer] = useState(false);

  const parsed = parseThreadParam(rawParam);
  if (!parsed) throw notFound();

  // TODO: remove the organizationUsers[0] fallback once activeOrganizationAtom
  // persists + hydrates the last used org synchronously on reload. See backlog.
  const orgId =
    activeOrg?.id ??
    workspaceCtx.organizationUsers?.[0]?.organization?.id;
  if (parsed.kind === "shortId" && !orgId) throw notFound();

  const where =
    parsed.kind === "ulid"
      ? { id: parsed.id }
      : { shortId: parsed.shortId, organizationId: orgId! };

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const checkHash = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (window.location.hash === "#answer-message") {
        setHighlightAnswer(true);
        timeoutId = setTimeout(() => setHighlightAnswer(false), 5000);
      } else {
        setHighlightAnswer(false);
      }
    };

    checkHash();
    window.addEventListener("hashchange", checkHash);

    return () => {
      window.removeEventListener("hashchange", checkHash);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const thread = useLiveQuery(
    query.thread.where(where).include({
      organization: true,
      author: true,
      messages: { include: { author: true } },
      assignedUser: true,
      updates: { include: { user: true } },
    }),
  )?.[0];

  const id = thread?.id ?? "";

  useEffect(() => {
    if (!thread) return;
    document.title = `${thread.name} - Threads - FrontDesk`;
  }, [thread]);

  useEffect(() => {
    if (!thread) return;
    const canonical = buildThreadParam(thread);
    if (rawParam !== canonical) {
      navigate({
        to: "/app/threads/$id",
        params: { id: canonical },
        hash: (prev) => prev ?? "",
        replace: true,
      });
    }
  }, [rawParam, thread, navigate]);

  const { captureThreadEvent } = useThreadAnalytics(thread);

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

  const firstItem = allItems[0];
  const restItems = allItems.slice(1);

  type ReplyGroup =
    | { type: "updates"; key: string; items: any[] }
    | { type: "message"; key: string; item: any };

  const replyGroups: ReplyGroup[] = [];
  for (const item of restItems) {
    if (item.itemType === "update") {
      const last = replyGroups[replyGroups.length - 1];
      if (last?.type === "updates") {
        last.items.push(item);
        continue;
      }
      replyGroups.push({ type: "updates", key: item.id, items: [item] });
    } else {
      replyGroups.push({ type: "message", key: item.id, item });
    }
  }

  const { scrollRef, contentRef, disableAutoScroll } = useAutoScroll({
    smooth: false,
    content: allItems,
    offset: 180,
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

  if (!thread) {
    return <div className="flex size-full" />;
  }

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
          <div className="flex flex-col flex-1 w-full overflow-hidden">
            <div
              className="flex-1 overflow-y-auto overscroll-none"
              ref={scrollRef}
              onScroll={disableAutoScroll}
              onTouchMove={disableAutoScroll}
            >
              <div ref={contentRef}>
                <div className="flex flex-col gap-4 p-8 w-full max-w-5xl mx-auto">
                  {thread &&
                    (firstItem?.itemType === "message" ? (
                      <ThreadHeader title={thread.name} message={firstItem} />
                    ) : (
                      <h1 className="text-2xl font-semibold text-foreground">
                        {thread.name}
                      </h1>
                    ))}
                  {replyGroups.length > 0 && (
                    <>
                      <Separator />
                      {answerMessage && (
                        <ThreadReply
                          message={answerMessage}
                          canMarkAsAnswer={false}
                          highlight={false}
                          asCard
                        />
                      )}
                      <h2 className="text-base py-2">Replies</h2>
                    </>
                  )}

                  {replyGroups.map((group, gi) => (
                    <Fragment key={group.key}>
                      {/* {gi > 0 && <Separator className="bg-border/50" />} */}
                      {group.type === "updates" ? (
                        <ThreadUpdates updates={group.items} user={user} />
                      ) : (
                        <ThreadReply
                          message={group.item}
                          canMarkAsAnswer={!answerMessage}
                          highlight={highlightAnswer}
                        />
                      )}
                    </Fragment>
                  ))}
                </div>
                <div className="sticky bottom-0 w-full max-w-5xl mx-auto px-8 pb-4">
                  <ThreadToolbar
                    threadId={id}
                    organizationId={thread?.organizationId}
                    threadLabels={threadLabels}
                    currentStatus={thread?.status ?? 0}
                    user={{ ...user, image: user.image }}
                    captureThreadEvent={captureThreadEvent}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="w-64 border-l bg-muted/25 flex flex-col p-4 gap-4">
          <TooltipProvider>
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

            <RelatedThreadsSection threadId={id} />
          </TooltipProvider>
        </div>
      </div>
    </>
  );
}
