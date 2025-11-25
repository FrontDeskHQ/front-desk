import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";

import { RichText } from "@workspace/ui/components/blocks/tiptap";
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
import { Logo } from "@workspace/ui/components/logo";
import { Navbar } from "@workspace/ui/components/navbar";
import { useAutoScroll } from "@workspace/ui/hooks/use-auto-scroll";
import { safeParseJSON } from "@workspace/ui/lib/tiptap";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";
import { fetchClient } from "~/lib/live-state";
import { seo } from "~/utils/seo";

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
          messages: { author: true },
        })
        .get()
    )[0];

    if (!thread) {
      throw notFound();
    }

    return {
      thread,
    };
  },

  head: ({ loaderData }) => {
    const thread = loaderData.thread;
    const orgName = thread?.organization?.name ?? "Support";
    const threadName = thread?.name ?? "Thread";
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
  const thread = Route.useLoaderData().thread;

  const { scrollRef, disableAutoScroll } = useAutoScroll({
    smooth: false,
    content: (thread as any)?.messages,
    offset: 264,
  });

  // TODO: Update URL to reflect real organization discord link
  const integrationPaths = { discord: "https://discord.com/invite/acme" };

  return (
    <div className="flex flex-col size-full gap-4 sm:gap-8 min-h-screen">
      <Navbar>
        <Navbar.Group>
          <Logo>
            <Logo.Icon />
            <Logo.Text />
            <Logo.Separator />
            <Avatar
              src={thread.organization.logoUrl}
              variant="org"
              fallback={thread.organization.name}
              size="lg"
            />
            <Logo.Text>{thread.organization.name}</Logo.Text>
          </Logo>
        </Navbar.Group>
        <Navbar.Group>
          {/* TODO - FRO-80 Add social links when we have them */}
          {/* <Button size="sm" externalLink asChild>
            <a href={integrationPaths.discord} target="_blank" rel="noreferrer">
              Join Discord
            </a>
          </Button> */}
        </Navbar.Group>
      </Navbar>
      <div className="flex flex-col flex-1 px-4 pb-4 sm:pb-8 sm:px-8">
        <Card className="w-full flex-1 flex flex-col max-w-5xl min-h-5xl mx-auto">
          <CardHeader>
            <CardTitle>
              {thread && (
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
              {(thread as any)?.messages
                .sort((a: any, b: any) => a.id.localeCompare(b.id))
                .map((message: any) => (
                  <Card
                    key={message.id}
                    className={cn(
                      "relative before:w-[1px] before:h-4 before:left-4 before:absolute before:-top-4 not-first:before:bg-border",
                    )}
                  >
                    {/* TODO: update the way it's checking if it's an message from the current user */}
                    <CardHeader size="sm">
                      <CardTitle>
                        <Avatar
                          variant="user"
                          size="md"
                          fallback={message.author?.name}
                        />
                        <p>{message.author?.name}</p>
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
        </Card>
      </div>
    </div>
  );
}
