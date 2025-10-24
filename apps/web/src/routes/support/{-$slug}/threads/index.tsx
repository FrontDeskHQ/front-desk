import { createFileRoute, notFound } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
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
import { ThreadsCard } from "~/components/threads/threads-card";
import { fetchClient } from "~/lib/live-state";

export const Route = createFileRoute("/support/{-$slug}/threads/")({
  component: RouteComponent,

  loader: async ({ params }) => {
    const { slug } = params;
    // FIXME: Replace where by first when new version of live-state is out
    const organization = (
      await fetchClient.query.organization
        .where({ slug: slug })
        .include({ threads: true })
        .get()
    )[0];

    if (!organization) {
      throw notFound();
    }

    return {
      organization: organization as typeof organization | undefined,
    };
  },
});

function RouteComponent() {
  const organization = Route.useLoaderData().organization;
  // TODO: Update URL to reflect real organization discord link
  const integrationPaths = { discord: "https://discord.com/invite/acme" };

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
        <ThreadsCard organization={organization} hidePrivateProps={true} />
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">1</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive>
                2
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
