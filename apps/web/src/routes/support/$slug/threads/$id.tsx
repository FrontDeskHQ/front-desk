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
} from "@workspace/ui/components/blocks/tiptap";
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
  PriorityIndicator,
  PriorityText,
  StatusIndicator,
  StatusText,
} from "@workspace/ui/components/indicator";
import { useAutoScroll } from "@workspace/ui/hooks/use-auto-scroll";
import { safeParseJSON } from "@workspace/ui/lib/tiptap";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";
import { CircleUser } from "lucide-react";
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
    const thread = loaderData?.thread;
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

  const discordUrl = JSON.parse(organization.socials ?? "{}")?.discord;

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

  return (
    <div className="flex flex-col size-full gap-4 sm:gap-8 min-h-screen">
      <div className="flex flex-col flex-1 px-4 py-4 sm:py-8 sm:px-8">
        <div className="flex flex-1 justify-center">
          <div className="grow shrink max-w-0 2xl:max-w-64" />
          <Card className="w-full grow shrink flex flex-col max-w-5xl min-h-5xl">
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
                        <BreadcrumbLink asChild className="text-white">
                          <Link
                            to="/support/$slug/threads/$id"
                            params={{
                              slug: organization.slug,
                              id: thread.id,
                            }}
                          >
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
                {allItems.map((item) => {
                  if (item.itemType === "message") {
                    return (
                      <Card
                        key={item.id}
                        className={cn(
                          "relative before:w-[1px] before:h-4 before:left-4 before:absolute before:-top-4 not-first:before:bg-border"
                        )}
                      >
                        {/* TODO: update the way it's checking if it's an message from the current user */}
                        <CardHeader size="sm">
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
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <RichText content={safeParseJSON(item.content)} />
                        </CardContent>
                      </Card>
                    );
                  }

                  if (item.itemType === "update") {
                    return <Update key={item.id} update={item} />;
                  }

                  return null;
                })}
              </div>
              <Editor
                onSubmit={async (value) => {
                  const user = portalSession?.user;

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
            </div>
          </Card>
          <div className="grow shrink-0 md:block hidden max-w-64 flex flex-col gap-4 p-4">
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
          </div>
        </div>
      </div>
    </div>
  );
}
