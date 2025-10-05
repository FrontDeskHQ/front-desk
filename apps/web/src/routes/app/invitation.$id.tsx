import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Icon } from "@workspace/ui/components/logo";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { authClient } from "~/lib/auth-client";
import { getInvitation } from "~/lib/server-funcs/invitations";

export const Route = createFileRoute("/app/invitation/$id")({
  component: RouteComponent,
  loader: async ({ params }) => {
    return await getInvitation({ data: { id: params.id } })
      .then((data) => ({ data, error: null }))
      .catch((error) => ({
        error: error.message as string,
        data: null,
      }));
  },
});

function RouteComponent() {
  const invite = Route.useLoaderData();
  const { data, error } = invite;
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4 w-full max-w-xl items-center justify-center mx-auto p-8">
      <div className="absolute left-4 top-4 flex items-center gap-2">
        <div className="size-fit p-2 border rounded-md bg-muted">
          <Icon className="size-4" />
        </div>
        <h1 className="text-xl">FrontDesk</h1>
      </div>
      <Card className="w-full p-8 bg-muted/50">
        <CardContent className="items-center gap-6">
          {data ? (
            <>
              <Avatar className="size-10 rounded-md">
                <AvatarImage src={data?.organization.logoUrl ?? undefined} />
                <AvatarFallback className="scale-200">
                  {data?.organization.name[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <h2 className="text-lg font-normal text-center">
                {data?.creator.name} has invited you to join{" "}
                {data?.organization.name}
              </h2>
              <div className="flex justify-between gap-4 items-center sm:flex-row flex-col-reverse w-full mt-0 sm:mt-6">
                <p className="text-xs text-muted-foreground text-center">
                  Invitation expires in{" "}
                  {formatDistanceToNowStrict(data?.expiresAt as Date)}
                </p>
                <div className="flex gap-4 shrink-0 w-full sm:w-auto">
                  <Button variant="link" className="grow">
                    Decline
                  </Button>
                  <Button variant="default" className="grow">
                    Accept
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              {error === "INVITATION_EXPIRED" ? (
                <p className="text-center">
                  This invitation has expired.
                  <br /> Please contact the sender to get a new invitation.
                </p>
              ) : error === "INVALID_USER" ? (
                <p className="text-center">
                  This invitation is not for {user.email}.<br /> Please log in
                  with the correct email address.
                </p>
              ) : (
                <p className="text-center">This invitation is not valid.</p>
              )}
              <div className="flex justify-between items-center gap-4">
                <Button variant="link" asChild>
                  <Link to="/app">
                    <ArrowLeft />
                    Back to App
                  </Link>
                </Button>
                {error === "INVALID_USER" && (
                  <Button
                    variant="link"
                    onClick={() =>
                      authClient.signOut({
                        fetchOptions: {
                          onSuccess: () => navigate({ to: "/" }),
                        },
                      })
                    }
                  >
                    Logout
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
