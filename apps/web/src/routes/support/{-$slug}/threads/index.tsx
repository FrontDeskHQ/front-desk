import { createFileRoute } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
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

  return (
    <>
      <nav>navbar</nav>
      <div className=" mx-auto w-full px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center gap-6 rounded-lg bg-neutral-900 p-6 shadow-sm border border-neutral-800">
          <Avatar
            variant="org"
            size="xxl"
            src={organization?.logoUrl}
            fallback={organization?.name}
          />
          <div className="flex flex-col gap-2">
            <h1 className="font-bold sm:text-2xl">{organization?.name}</h1>
            <Button size="sm">Join</Button>
          </div>
        </div>
        <div className="mb-6">
          <Input
            placeholder="Search threads..."
            className="w-full bg-neutral-900 border-neutral-800 text-neutral-50 placeholder:text-neutral-400"
          />
        </div>
        <div className="space-y-2">
          {organization?.threads.map((thread) => (
            <div
              key={thread.id}
              className="rounded-lg bg-neutral-900 border border-neutral-800 shadow-sm transition-all hover:border-neutral-700 hover:shadow-md"
            >
              <ListItem threadId={thread.id} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
