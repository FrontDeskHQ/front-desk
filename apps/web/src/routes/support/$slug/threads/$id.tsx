import type { InferLiveObject } from "@live-state/sync";
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
import type { schema } from "api/schema";
import { CircleUser } from "lucide-react";
import { Fragment, useEffect, useState } from "react";

import { SupportRelatedThreadsSection } from "~/components/threads/support-related-threads-section";
import { ThreadHeader } from "~/components/threads/thread-header";
import { ThreadReply } from "~/components/threads/thread-reply";
import { ThreadUpdates } from "~/components/threads/thread-updates";
import { fetchClient } from "~/lib/live-state";
import { seo } from "~/utils/seo";
import { buildThreadParam, parseThreadParam } from "~/utils/thread";

type SupportThreadMessage = InferLiveObject<
  typeof schema.message,
  { author: true }
>;
type SupportThreadUpdate = InferLiveObject<typeof schema.update>;
type TimelineMessageItem = SupportThreadMessage & { itemType: "message" };
type TimelineUpdateItem = SupportThreadUpdate & { itemType: "update" };

export const Route = createFileRoute("/support/$slug/threads/$id")({
  component: RouteComponent,

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

  loader: async ({ params, context }) => {
    const parsed = parseThreadParam(params.id);
    if (!parsed) throw notFound();

    const where =
      parsed.kind === "ulid"
        ? { id: parsed.id, organizationId: context.organization.id }
        : { shortId: parsed.shortId, organizationId: context.organization.id };

    const thread = await fetchClient.query.thread.detail(where);

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
        hash: (prev) => prev ?? "",
        params: { id: canonical, slug: organization.slug },
        replace: true,
        to: "/support/$slug/threads/$id",
      });
    }
  }, [rawParam, thread, organization.slug, route]);

  const { portalSession } = getRouteApi("/support/$slug").useRouteContext();
  const user = portalSession?.user;
  const [highlightAnswer, setHighlightAnswer] = useState(false);

  const allItems = thread
    ? [
        ...(thread?.messages ?? []).map(
          (msg): TimelineMessageItem => ({
            ...msg,
            itemType: "message",
          })
        ),
        ...(thread?.updates ?? []).map(
          (update): TimelineUpdateItem => ({
            ...update,
            itemType: "update",
          })
        ),
      ].toSorted((a, b) => a.id.localeCompare(b.id))
    : [];

  const firstMessageIndex = allItems.findIndex(
    (item) => item.itemType === "message"
  );
  const firstItem =
    firstMessageIndex === -1 ? undefined : allItems[firstMessageIndex];
  const restItems = allItems.filter((_, index) => index !== firstMessageIndex);

  type ReplyGroup =
    | { type: "updates"; key: string; items: TimelineUpdateItem[] }
    | { type: "message"; key: string; item: TimelineMessageItem };

  const replyGroups: ReplyGroup[] = [];
  for (const item of restItems) {
    if (item.itemType === "update") {
      const last = replyGroups.at(-1);
      if (last?.type === "updates") {
        last.items.push(item);
        continue;
      }
      replyGroups.push({ items: [item], key: item.id, type: "updates" });
    } else {
      replyGroups.push({ item, key: item.id, type: "message" });
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

  const answerMessage = thread?.messages.find(
    (message) => message.markedAsAnswer
  );
  const isThreadAuthor = Boolean(user && thread?.author?.userId === user.id);

  return (
    <div className="flex flex-col w-full flex-1">
      <div className="flex justify-center px-4 py-4 sm:py-8 sm:px-8">
        <div className="grow shrink max-w-0 2xl:max-w-64" />
        <div className="w-full grow shrink flex flex-col max-w-5xl">
          <div className="flex flex-col gap-4 px-8 w-full max-w-5xl mx-auto">
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
          <div className="w-full max-w-5xl mx-auto px-8 pt-6 pb-8 mt-6">
            {user ? (
              <Editor
                onSubmit={async (value) => {
                  if (!user) {
                    return;
                  }

                  await fetchClient.mutate.message.create({
                    content: value,
                    organizationId: thread.organizationId,
                    threadId: thread.id,
                    userId: user.id,
                    userName: user.name,
                  });

                  // TODO: Find out how to only invalidate this route
                  route.invalidate();
                }}
              >
                <EditorInput
                  className="w-full bg-[#1B1B1E]"
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
        <div className="grow shrink-0 md:flex hidden max-w-64 flex-col gap-4 p-4 pt-10">
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
