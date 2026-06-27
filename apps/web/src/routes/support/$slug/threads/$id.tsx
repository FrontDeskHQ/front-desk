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
} from "@workspace/ui/components/blocks/tiptap";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import {
  PriorityIndicator,
  PriorityText,
  StatusIndicator,
  StatusText,
} from "@workspace/ui/components/indicator";
import { LabelBadge } from "@workspace/ui/components/label-badge";
import { Separator } from "@workspace/ui/components/separator";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { useAutoScroll } from "@workspace/ui/hooks/use-auto-scroll";
import { CircleUser } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { SupportRelatedThreadsSection } from "~/components/threads/support-related-threads-section";
import { ThreadHeader } from "~/components/threads/thread-header";
import { ThreadReply } from "~/components/threads/thread-reply";
import { ThreadUpdates } from "~/components/threads/thread-updates";
import { fetchClient } from "~/lib/live-state";
import { seo } from "~/utils/seo";
import { buildThreadParam, parseThreadParam } from "~/utils/thread";

export const Route = createFileRoute("/support/$slug/threads/$id")({
  component: RouteComponent,

  loader: async ({ params, context }) => {
    const parsed = parseThreadParam(params.id);
    if (!parsed) throw notFound();

    const where =
      parsed.kind === "ulid"
        ? { id: parsed.id, organizationId: context.organization.id }
        : { shortId: parsed.shortId, organizationId: context.organization.id };

    const thread = (
      await fetchClient.query.thread
        .where(where)
        .include({
          author: true,
          messages: { include: { author: true } },
          assignedUser: true,
          updates: { include: { user: true } },
          labels: {
            include: { label: true },
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
  const { id: rawParam } = Route.useParams();

  useEffect(() => {
    const canonical = buildThreadParam(thread);
    if (rawParam !== canonical) {
      route.navigate({
        to: "/support/$slug/threads/$id",
        params: { slug: organization.slug, id: canonical },
        hash: (prev) => prev ?? "",
        replace: true,
      });
    }
  }, [rawParam, thread, organization.slug, route]);

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

  const enabledLabels =
    thread?.labels?.filter((tl) => tl.enabled && !!tl.label?.enabled) ?? [];

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

  const { scrollRef, contentRef, disableAutoScroll } = useAutoScroll({
    smooth: false,
    content: allItems,
    offset: 264,
  });

  const answerMessage = thread?.messages.find(
    (message) => message.markedAsAnswer,
  );
  const isThreadAuthor = Boolean(user && thread?.author?.userId === user.id);

  return (
    <div className="flex flex-col w-full">
      <div className="flex flex-1 justify-center px-4 py-4 sm:py-8 sm:px-8">
        <div className="grow shrink max-w-0 2xl:max-w-64" />
        <div className="w-full grow shrink flex flex-col max-w-5xl overflow-hidden">
          <div className="flex flex-col flex-1 w-full overflow-hidden">
            <div
              className="flex-1 overflow-y-auto overscroll-none"
              ref={scrollRef}
              onScroll={disableAutoScroll}
              onTouchMove={disableAutoScroll}
            >
              <div ref={contentRef} className="flex flex-col min-h-full">
                <div className="flex flex-col gap-4 p-8 w-full max-w-5xl mx-auto flex-1">
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

                  {replyGroups.map((group) => (
                    <Fragment key={group.key}>
                      {group.type === "updates" ? (
                        <ThreadUpdates updates={group.items} user={user} />
                      ) : (
                        <ThreadReply
                          message={group.item}
                          canMarkAsAnswer={isThreadAuthor && !answerMessage}
                          highlight={highlightAnswer}
                          onMarkAsAnswer={async () => {
                            await fetchClient.mutate.message.markAsAnswer({
                              messageId: group.item.id,
                            });
                            route.invalidate();
                          }}
                        />
                      )}
                    </Fragment>
                  ))}
                </div>
                <div className="sticky bottom-0 w-full max-w-5xl mx-auto px-8 pb-4">
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
              </div>
            </div>
          </div>
        </div>
        <div className="grow shrink-0 md:flex hidden max-w-64 flex-col gap-4 p-4">
          <TooltipProvider>
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
                <div className="flex items-center px-1.5 gap-2 flex-wrap">
                  {enabledLabels.length > 0 ? (
                    enabledLabels.map((threadLabel) => (
                      <LabelBadge
                        key={threadLabel.label.id}
                        name={threadLabel.label.name}
                        color={threadLabel.label.color}
                      />
                    ))
                  ) : (
                    <span className="text-muted-foreground">No labels</span>
                  )}
                </div>
              </div>
            </div>
            <SupportRelatedThreadsSection
              threadId={thread.id}
              organizationId={thread.organizationId}
              slug={organization.slug}
            />
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
