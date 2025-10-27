import { createFileRoute, notFound } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { RichText } from "@workspace/ui/components/blocks/tiptap";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Header } from "@workspace/ui/components/header";
import { useAutoScroll } from "@workspace/ui/hooks/use-auto-scroll";
import { safeParseJSON } from "@workspace/ui/lib/tiptap";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";
import { useEffect } from "react";
import { fetchClient } from "~/lib/live-state";

export const Route = createFileRoute("/support/$slug/threads/$id")({
  component: RouteComponent,

  loader: async ({ params }) => {
    const { id } = params;

    const thread = (
      await fetchClient.query.thread
        .where({
          id,
        })
        .include({
          organization: true,
          author: true,
          messages: true,
        })
        .get()
    )[0];

    if (!thread) {
      throw notFound();
    }

    return {
      thread: thread as typeof thread | undefined,
    };
  },
});

function RouteComponent() {
  const thread = Route.useLoaderData().thread;

  const { scrollRef, disableAutoScroll } = useAutoScroll({
    smooth: false,
    content: thread?.messages,
    offset: 264,
  });

  useEffect(() => {
    console.debug("thread", thread);
  }, [thread]);

  if (!thread) {
    return null;
  }

  return (
    <div className="flex flex-col size-full">
      <Header />
      <div className="flex-1 flex flex-col">
        <CardHeader>
          <CardTitle>
            {/* {thread && (
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link
                        to="/support/$slug/threads"
                        params={{ slug: thread.organization.slug }}
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
                          slug: thread.organization.slug,
                          id: thread.id,
                        }}
                      >
                        {thread.name}
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            )} */}
          </CardTitle>
        </CardHeader>
        <div className="flex flex-col p-4 gap-4 flex-1 w-full max-w-5xl mx-auto overflow-hidden">
          <div
            className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto"
            ref={scrollRef}
            onScroll={disableAutoScroll}
            onTouchMove={disableAutoScroll}
          >
            {thread?.messages
              .sort((a, b) => a.id.localeCompare(b.id))
              .map((message) => (
                <Card
                  key={message.id}
                  className={cn(
                    "relative before:w-[1px] before:h-4 before:left-4 before:absolute before:-top-4 not-first:before:bg-border",
                    !message.origin && "border-[#2662D9]/20",
                  )}
                >
                  {/* TODO: update the way it's checking if it's an message from the current user */}
                  <CardHeader
                    size="sm"
                    className={cn(
                      !message.origin && "bg-[#2662D9]/15 border-[#2662D9]/20",
                    )}
                  >
                    <CardTitle>
                      {/* TODO update when live-state supports deep includes */}
                      <Avatar variant="user" size="md" fallback={"P"} />
                      {/* TODO update when live-state supports deep includes */}
                      <p>message.author.name</p>
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
