import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Logo } from "@workspace/ui/components/logo";
import { Separator } from "@workspace/ui/components/separator";
import { Spinner } from "@workspace/ui/components/spinner";
import { useAsyncAction } from "@workspace/ui/hooks/use-action";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowRightIcon, Check } from "lucide-react";
import { useState } from "react";
import { useLogout } from "~/lib/hooks/auth";
import { fetchClient } from "~/lib/live-state";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/app/onboarding/")({
  component: RouteComponent,
  async loader({ context }) {
    const user = context.user;

    const [orgUsers, invites] = await Promise.all([
      fetchClient.query.organizationUser
        .where({
          userId: user.id,
          enabled: true,
        })
        .include({
          organization: true,
        })
        .get()
        .catch(() => null),
      fetchClient.query.invite
        .where({
          email: user.email,
          active: true,
          expiresAt: {
            $gt: new Date(),
          },
        })
        .include({
          organization: true,
        })
        .get()
        .catch(() => null),
    ]);

    if (orgUsers && orgUsers.length > 0) {
      throw redirect({
        to: "/app",
      });
    }

    if (!invites || invites.length === 0) {
      throw redirect({
        to: "/app/onboarding/new",
      });
    }

    return {
      invites,
    };
  },
  head: () => {
    return {
      meta: [
        ...seo({
          title: "Onboarding - FrontDesk",
          description: "Join your organization or create a new one",
        }),
      ],
    };
  },
});

function OnboardingForm() {
  const { invites } = Route.useLoaderData();
  const { user } = Route.useRouteContext();
  const [acceptedSomeInvite, setAcceptedSomeInvite] = useState(false);
  const [isPending, asyncAction] = useAsyncAction();
  const logout = useLogout();

  return (
    <div className="flex flex-col gap-6 w-md items-center">
      <div className="absolute left-4 top-4 flex items-center gap-2">
        <div className="size-fit p-2 border rounded-md bg-muted">
          <Logo>
            <Logo.Icon className="size-4" />
          </Logo>
        </div>
        <h1 className="text-xl">FrontDesk</h1>
      </div>
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
        <span className="text-sm text-muted-foreground">
          Logged in as: {user.email}
        </span>
        <Button variant="outline" size="sm" onClick={logout}>
          Logout
        </Button>
      </div>
      <h1 className="text-xl font-medium">Join your teammates</h1>
      <Card className="w-full p-4 bg-muted/50">
        <CardContent className="items-center gap-4">
          {invites.map((invite) => (
            <div key={invite.id} className="flex justify-between w-full">
              <div className="flex gap-2 items-center">
                <Avatar
                  variant="org"
                  size="xl"
                  src={invite.organization.logoUrl ?? undefined}
                  fallback={invite.organization.name}
                />
                <h2>{invite.organization.name}</h2>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  asyncAction(() =>
                    fetchClient.mutate.invite.accept({
                      id: invite.id,
                    }),
                  ).then(() => {
                    setAcceptedSomeInvite(true);
                  });
                }}
              >
                {isPending ? (
                  <>
                    <Spinner /> Joining
                  </>
                ) : acceptedSomeInvite ? (
                  <>
                    <Check /> Joined
                  </>
                ) : (
                  "Join"
                )}
              </Button>
            </div>
          ))}
          <Separator />
          <Button
            variant="outline"
            className="w-full"
            render={<Link to="/app/onboarding/new" />}
          >
            Create new organization
          </Button>
        </CardContent>
      </Card>
      <div
        className={cn(
          "w-full flex justify-end opacity-0 pointer-events-none",
          acceptedSomeInvite && "opacity-100 pointer-events-auto",
        )}
      >
        <Button render={<Link to="/app" />}>
          Continue to app
          <ArrowRightIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function RouteComponent() {
  return (
    <div className="w-screen h-screen flex items-center justify-center bg-muted/20">
      <OnboardingForm />
    </div>
  );
}
