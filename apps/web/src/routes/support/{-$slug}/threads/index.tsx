import { createFileRoute } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { Header } from "@workspace/ui/components/header";
import { Search } from "@workspace/ui/components/input";
import { useState } from "react";
import { fetchClient } from "~/lib/live-state";
import { ListItem } from "~/routes/app/_workspace/_main/threads";

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

    return {
      organization: organization as typeof organization | undefined,
    };
  },
});

function RouteComponent() {
  const organization = Route.useLoaderData().organization;
  const [page] = useState(0);

  return (
    <div className="w-full">
      <Header />
      <div className="flex flex-col gap-8 mx-auto px-15 py-8 md:px-30">
        <div className="flex items-center gap-6 p-6 border border-neutral-800">
          <Avatar
            variant="org"
            size="xxl"
            src={organization?.logoUrl}
            fallback={organization?.name}
          />
          <div className="flex justify-between w-full">
            <h1 className="font-bold text-3xl">{organization?.name}</h1>
            <Button size="lg" externalLink={true}>
              Join
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-6">
          <Search placeholder="Search threads..." />
          <div className="space-y-2">
            {organization?.threads.map((thread) => (
              <div
                key={thread.id}
                className="rounded-lg border border-neutral-800 shadow-sm transition-all hover:border-neutral-700 hover:shadow-md"
              >
                <ListItem threadId={thread.id} />
              </div>
            ))}
          </div>
        </div>
        <div className={`flex ${page > 0 ? "justify-between" : "justify-end"}`}>
          {page > 0 && <Button variant="outline">Previous</Button>}
          <Button variant="outline">Next</Button>
        </div>
      </div>
    </div>
  );
}
