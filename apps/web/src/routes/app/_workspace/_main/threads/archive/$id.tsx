import { useLiveQuery } from "@live-state/sync/client";
import {
  createFileRoute,
  getRouteApi,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { RichText } from "@workspace/ui/components/blocks/tiptap";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
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
import { useAutoScroll } from "@workspace/ui/hooks/use-auto-scroll";
import { safeParseJSON } from "@workspace/ui/lib/tiptap";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";
import { add } from "date-fns";
import { Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { fetchClient, mutate, query } from "~/lib/live-state";
import { seo } from "~/utils/seo";
import { DAYS_UNTIL_DELETION, getDaysUntilDeletion } from "~/utils/thread";

export const Route = createFileRoute(
  "/app/_workspace/_main/threads/archive/$id",
)({
  component: RouteComponent,
  loader: async ({ params }) => {
    const { id } = params;
    const thread = (
      await fetchClient.query.thread
        .where({
          id,
          deletedAt: {
            $not: null,
            $lt: add(new Date(), {
              days: DAYS_UNTIL_DELETION,
            }),
          },
        })
        .include({
          organization: true,
          messages: { author: true },
          assignedUser: true,
        })
        .get()
    )[0];
    return { thread };
  },
  head: ({ loaderData }) => {
    const thread = loaderData?.thread;
    const threadName = thread?.name ?? "Thread";
    return {
      meta: [
        ...seo({
          title: `${threadName} - Archive - FrontDesk`,
          description: `Archived thread: ${threadName}`,
        }),
      ],
    };
  },
});

function RouteComponent() {
  const { user } = getRouteApi("/app").useRouteContext();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);

  const thread = useLiveQuery(
    query.thread
      .where({
        id,
        deletedAt: {
          $not: null,
          $lt: add(new Date(), {
            days: DAYS_UNTIL_DELETION,
          }),
        },
      })
      .include({
        organization: true,
        messages: { author: true },
        assignedUser: true,
      }),
  )?.[0];

  const { scrollRef, disableAutoScroll } = useAutoScroll({
    smooth: false,
    content: (thread as any)?.messages,
    offset: 264,
  });

  const restoreThread = () => {
    mutate.thread.update(id, {
      deletedAt: null,
    });
    setShowRestoreDialog(false);
    toast.success("Thread restored", {
      duration: 10000,
      action: {
        label: "See thread",
        onClick: () => navigate({ to: "/app/threads/$id", params: { id } }),
      },
      // TODO: Analyse this when working on the design system
      actionButtonStyle: {
        background: "transparent",
        color: "hsl(var(--primary))",
        border: "none",
        textDecoration: "underline",
      },
    });
    navigate({ to: "/app/threads/archive" });
  };

  if (!thread) return undefined;

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
                        <Link to="/app/threads/archive">Archive</Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{thread.name}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Restore Thread</DialogTitle>
              <DialogDescription>
                Are you sure you want to restore the thread "{thread?.name}"?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="submit"
                variant="outline"
                onClick={() => {
                  restoreThread();
                }}
              >
                Restore
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* //TODO: Update deletion countdown */}
        <div className="flex gap-4 items-center justify-center w-full text-center bg-destructive/80 text-destructive-foreground p-3 text-sm">
          <p>
            This thread will be permanently deleted in{" "}
            {getDaysUntilDeletion(thread.deletedAt)} days.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRestoreDialog(true)}
          >
            <Undo2 />
            Restore thread
          </Button>
        </div>
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
        </div>
      </div>
    </div>
  );
}
