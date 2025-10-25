import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Header } from "@workspace/ui/components/header";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@workspace/ui/components/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { getFirstTextContent, safeParseJSON } from "@workspace/ui/lib/tiptap";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import { z } from "zod";
import { fetchClient } from "~/lib/live-state";

const threadsSearchSchema = z.object({
  page: z.number().catch(1),
  order: z.enum(["createdAt", "updatedAt"]).catch("createdAt"),
});

type ThreadsSearchOrderOptions = z.infer<
  typeof threadsSearchSchema.shape.order
>;

export const Route = createFileRoute("/support/{-$slug}/threads/")({
  component: RouteComponent,

  validateSearch: (search) => threadsSearchSchema.parse(search),

  loader: async ({ params }) => {
    const { slug } = params;
    // FIXME: Replace where by first when new version of live-state is out
    const organization = (
      await fetchClient.query.organization.where({ slug: slug }).get()
    )[0];

    if (!organization) {
      throw notFound();
    }

    // TODO Deep include thread messages and assigned user when live-state supports it
    // TODO reverse sort messages by createdAt
    const threads = await fetchClient.query.thread
      .where({
        organizationId: organization.id,
      })
      .include({ messages: true, assignedUser: true })
      .get();

    return {
      organization: organization as typeof organization | undefined,
      threads: threads as typeof threads | undefined,
    };
  },
});

function RouteComponent() {
  const organization = Route.useLoaderData().organization;
  const threads = Route.useLoaderData().threads;
  const { page, order } = Route.useSearch();
  const navigate = Route.useNavigate();

  // TODO: Update URL to reflect real organization discord link
  const integrationPaths = { discord: "https://discord.com/invite/acme" };

  const orderByOptions: { label: string; value: ThreadsSearchOrderOptions }[] =
    [
      { label: "Created", value: "createdAt" },
      { label: "Last message", value: "updatedAt" },
    ];

  const handleSortChange = (value: ThreadsSearchOrderOptions) => {
    navigate({
      search: (prev) => ({ ...prev, order: value }),
    });
  };

  const filteredAndOrderedThreads = [...(threads ?? [])].sort((a, b) => {
    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;

    switch (order) {
      case "createdAt":
        return bDate - aDate;
      case "updatedAt":
        return aDate - bDate;
      default:
        return bDate - aDate;
    }
  });

  if (!organization) {
    return null;
  }

  return (
    <div className="w-full">
      <Header />
      <div className="flex flex-col max-w-5xl gap-8 mx-auto py-8">
        <div className="flex items-center gap-6">
          <Avatar
            variant="org"
            size="xxl"
            src={organization?.logoUrl}
            fallback={organization?.name}
          />
          <div className="flex justify-between w-full">
            <h1 className="font-bold text-3xl">{organization?.name}</h1>
            <Button size="lg" externalLink asChild>
              <a
                href={integrationPaths.discord}
                target="_blank"
                rel="noreferrer"
              >
                Join Discord
              </a>
            </Button>
          </div>
        </div>
        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle className="gap-4">Threads</CardTitle>
            <CardAction side="right">
              <Select
                value={order}
                onValueChange={(value) =>
                  handleSortChange(value as ThreadsSearchOrderOptions)
                }
                items={orderByOptions}
              >
                <SelectTrigger className="w-32" data-size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {orderByOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardAction>
          </CardHeader>
          <CardContent className="overflow-y-auto gap-0 items-center">
            {filteredAndOrderedThreads?.map((thread) => (
              <Link
                key={thread.id}
                to={"/support/{-$slug}/threads/$id"}
                params={{ slug: organization.slug, id: thread.id }}
                className="w-full max-w-5xl flex flex-col p-3 gap-2 hover:bg-muted"
              >
                <div className="flex justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar variant="user" size="md" fallback={"P"} />
                    <div>{thread?.name}</div>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    <span className="font-medium">
                      {/* TODO update when live-state supports deep includes */}
                      {/* {thread?.messages?.[thread?.messages?.length - 1]?.author?.name} */}
                      Author:&nbsp;
                    </span>
                    <span className="truncate">
                      {getFirstTextContent(
                        safeParseJSON(
                          thread?.messages?.[thread?.messages?.length - 1]
                            ?.content ?? "",
                        ),
                      )}
                    </span>
                  </span>
                  <div className="text-muted-foreground">
                    {thread?.createdAt
                      ? formatRelativeTime(thread?.createdAt as Date)
                      : null}
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink isActive>1</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink>
                <Link to="." search={{ page: 2 }}>
                  2
                </Link>
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">3</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
