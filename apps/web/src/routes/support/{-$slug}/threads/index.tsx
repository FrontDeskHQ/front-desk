import { createFileRoute } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { Header } from "@workspace/ui/components/header";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";
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
            <Button size="lg" externalLink={true}>
              Join Discord
            </Button>
          </div>
        </div>
        <ThreadsCard organizationId={organization?.id} onPublicPage={true} />
        <div className={`flex ${page > 0 ? `justify-between` : `justify-end`}`}>
          {page > 0 && (
            <Button variant="outline">
              <ArrowLeft />
              Previous
            </Button>
          )}
          <Button variant="outline">
            Next <ArrowRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
