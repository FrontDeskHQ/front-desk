import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Logo } from "@workspace/ui/components/logo";
import { Spinner } from "@workspace/ui/components/spinner";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { useTransition } from "react";
import { useLogout } from "~/lib/hooks/auth";
import { fetchClient } from "~/lib/live-state";
import { getInvitation } from "~/lib/server-funcs/invitations";
import { seo } from "~/utils/seo";

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
  head: ({ loaderData }) => {
    const orgName =
      loaderData?.data?.organization?.name ?? "Organization";
    return {
      meta: [
        ...seo({
          title: `Invitation to ${orgName} - FrontDesk`,
          description: `You've been invited to join ${orgName}`,
        }),
      ],
    };
  },
});

function RouteComponent() {
  const invite = Route.useLoaderData();
  const { data, error } = invite;
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [isPending, startTransition] = useTransition();
  const logout = useLogout();

  return (
    <div className="flex flex-col gap-4 w-full max-w-xl items-center justify-center mx-auto p-8">
      <div className="absolute left-4 top-4 flex items-center gap-2">
        <div className="size-fit p-2 border rounded-md bg-muted">
          <Logo>
            <Logo.Icon className="size-4" />
          </Logo>
        </div>
        <h1 className="text-xl">FrontDesk</h1>
      </div>
      <Card className="w-full p-8 bg-muted/50">
        <CardContent className="items-center gap-6">
          {data ? (
            <>
              <Avatar
                variant="org"
                size="xl"
                src={data?.organization.logoUrl ?? undefined}
                fallback={data?.organization.name}
              />
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
                  <Button
                    variant="link"
                    className="grow"
                    onClick={() => {
                      startTransition(async () => {
                        await fetchClient.mutate.invite.decline({
                          id: data?.id,
                        });
                        navigate({ to: "/app" });
                      });
                    }}
                    disabled={isPending}
                  >
                    Decline
                  </Button>
                  <Button
                    variant="default"
                    className="grow"
                    disabled={isPending}
                    onClick={() => {
                      startTransition(async () => {
                        await fetchClient.mutate.invite
                          .accept({
                            id: data?.id,
                          })
                          .then(() => {
                            navigate({ to: "/app" });
                          })
                          .catch((error) => {
                            // TODO add toast to show error
                            console.error(error);
                          });
                      });
                    }}
                  >
                    {isPending && <Spinner />}
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
                  <Button variant="link" onClick={logout}>
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
