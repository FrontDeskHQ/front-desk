import {
  createFileRoute,
  getRouteApi,
  Link,
  notFound,
  useRouter,
} from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import {
  Editor,
  EditorInput,
  EditorSubmit,
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
  PriorityIndicator,
  PriorityText,
  StatusIndicator,
  StatusText,
} from "@workspace/ui/components/indicator";
import { LabelBadge } from "@workspace/ui/components/label-badge";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { useAutoScroll } from "@workspace/ui/hooks/use-auto-scroll";
import { safeParseJSON } from "@workspace/ui/lib/tiptap";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";
import { ArrowDown, Check, CircleUser } from "lucide-react";
import { useEffect, useState } from "react";
import { Update } from "~/components/threads/updates";
import { fetchClient } from "~/lib/live-state";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/support/$slug/threads/$id")({
  component: RouteComponent,

  loader: async ({ params, context }) => {
    const { id } = params;

    const thread = (
      await fetchClient.query.thread
        .where({
          id,
          organizationId: context.organization.id,
        })
        .include({
          author: true,
          messages: { author: true },
          assignedUser: true,
          updates: { user: true },
          labels: {
            label: true,
          },
        })
        .get()
    )[0];

    if (!thread) {
      throw notFound();
    }

    return {
      thread,
      headData: {
        organizationName: context.organization.name,
        threadName: thread.name,
      },
    };
  },
  head: ({ loaderData }) => {
    const orgName = loaderData?.headData?.organizationName ?? "Support";
    const threadName = loaderData?.headData?.threadName ?? "Thread";
    return {
      meta: [
        ...seo({
          title: `${threadName} - ${orgName} - Support`,
          description: `Support thread: ${threadName}`,
        }),
      ],
    };
  },
});

function RouteComponent() {
  const route = useRouter();
  const { organization } = Route.useRouteContext();
  const { thread } = Route.useLoaderData();

  const { portalSession } = getRouteApi("/support/$slug").useRouteContext();
  const user = portalSession?.user;
  const [highlightAnswer, setHighlightAnswer] = useState(false);

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

  const { scrollRef, disableAutoScroll } = useAutoScroll({
    smooth: false,
    content: allItems,
    offset: 264,
  });

  const answerMessage = thread?.messages.find(
    (message) => message.markedAsAnswer,
  );
  const isThreadAuthor = Boolean(user && thread?.author?.userId === user.id);

  return (
    <div className="flex flex-col w-full gap-4 sm:gap-8">
      <div className="flex flex-col flex-1 px-4 py-4 sm:py-8 sm:px-8">
        <div className="flex flex-1 justify-center">
          <div className="grow shrink max-w-0 2xl:max-w-64" />
          <Card className="w-full grow shrink flex flex-col max-w-5xl">
            <CardHeader>
              <CardTitle>
                {thread && (
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                          <Link
                            to="/support/$slug/threads"
                            params={{ slug: organization.slug }}
                          >
                            Threads
                          </Link>
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbPage>{thread.name}</BreadcrumbPage>
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
                {allItems.map((item, i) => {
                  if (item.itemType === "message") {
                    return (
                      <TooltipProvider key={item.id}>
                        <Card
                          className={cn(
                            "relative before:w-px before:h-4 before:left-4 before:absolute before:-top-4 not-first:before:bg-border group transition-[color,box-shadow] data-[highlight=true]:border-ring data-[highlight=true]:ring-ring/50 data-[highlight=true]:ring-[3px]",
                            item.markedAsAnswer && "border-green-700/30",
                          )}
                          data-highlight={
                            item.markedAsAnswer && highlightAnswer
                          }
                          id={
                            item.markedAsAnswer ? "answer-message" : undefined
                          }
                        >
                          {/* TODO: update the way it's checking if it's an message from the current user */}
                          <CardHeader
                            size="sm"
                            className={cn(
                              "px-2",
                              item.markedAsAnswer &&
                                "bg-green-800/10 border-green-700/30",
                            )}
                          >
                            <CardTitle>
                              <Avatar
                                variant="user"
                                size="md"
                                fallback={item.author?.name}
                              />
                              <p>{item.author?.name}</p>
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
                              {item.markedAsAnswer && (
                                <>
                                  <span className="bg-muted-foreground size-0.75 rounded-full" />
                                  <Check className="size-3.5" />
                                  <p className="text-muted-foreground">
                                    Marked as answer
                                  </p>
                                </>
                              )}
                            </CardTitle>
                            {i > 0 && isThreadAuthor && !answerMessage && (
                              <CardAction
                                side="right"
                                className="hidden group-hover:flex"
                              >
                                <ActionButton
                                  variant="ghost"
                                  size="icon-sm"
                                  tooltip="Mark as answer"
                                  onClick={async () => {
                                    await fetchClient.mutate.message.markAsAnswer(
                                      {
                                        messageId: item.id,
                                      },
                                    );
                                    route.invalidate();
                                  }}
                                >
                                  <Check />
                                </ActionButton>
                              </CardAction>
                            )}
                          </CardHeader>
                          <CardContent
                            className={cn(
                              i === 0 && answerMessage && "border-b",
                            )}
                          >
                            <RichText content={safeParseJSON(item.content)} />
                          </CardContent>
                          {i === 0 && answerMessage && (
                            <CardFooter className="flex-col items-start p-4 gap-2 bg-green-800/15 border-t-0">
                              <div className="text-xs flex items-center gap-2">
                                <Check className="size-3.5" /> Answered by{" "}
                                {answerMessage.author?.name}
                                <p className="text-muted-foreground">
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
                                    to="/support/$slug/threads/$id"
                                    params={{
                                      slug: organization.slug,
                                      id: thread.id,
                                    }}
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
                    return <Update key={item.id} update={item} />;
                  }

                  return null;
                })}
              </div>
              {user ? (
                <Editor
                  onSubmit={async (value) => {
                    if (!user) return;

                    await fetchClient.mutate.message.create({
                      threadId: thread.id,
                      content: value,
                      userId: user.id,
                      userName: user.name,
                      organizationId: thread.organizationId,
                    });

                    // TODO: Find out how to only invalidate this route
                    route.invalidate();
                  }}
                >
                  <EditorInput
                    className="bottom-2.5 w-full shadow-lg bg-[#1B1B1E]"
                    placeholder="Write a reply..."
                  >
                    <EditorSubmit />
                  </EditorInput>
                </Editor>
              ) : (
                <div className="flex flex-col gap-2 justify-center items-center text-foreground-secondary pt-8 pb-4 border-t">
                  You must be signed in to reply to this thread.
                </div>
              )}
            </div>
          </Card>
          <div className="grow shrink-0 md:flex hidden max-w-64 flex-col gap-4 p-4">
            <div className="flex flex-col gap-2">
              <div className="text-muted-foreground text-xs">
                Thread properties
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex px-1.5 gap-2 items-center">
                  <div className="flex items-center justify-center size-4">
                    <StatusIndicator status={thread?.status ?? 0} />
                  </div>
                  <StatusText status={thread?.status ?? 0} />
                </div>
                <div className="flex px-1.5 gap-2 items-center">
                  <div className="flex items-center justify-center size-4">
                    <PriorityIndicator priority={thread?.priority ?? 0} />
                  </div>
                  <PriorityText priority={thread?.priority ?? 0} />
                </div>
                <div className="flex px-1.5 gap-2 items-center">
                  <div className="flex items-center justify-center size-4">
                    {thread?.assignedUserId ? (
                      <Avatar
                        variant="user"
                        size="md"
                        fallback={thread.assignedUser?.name}
                      />
                    ) : (
                      <CircleUser className="size-4" />
                    )}
                  </div>
                  <p>{thread?.assignedUser?.name ?? "Unassigned"}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-muted-foreground text-xs">Labels</div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {thread?.labels
                    ?.filter((tl) => tl.enabled && !!tl.label?.enabled)
                    .map((threadLabel) => (
                      <LabelBadge
                        key={threadLabel.label.id}
                        name={threadLabel.label.name}
                        color={threadLabel.label.color}
                      />
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
