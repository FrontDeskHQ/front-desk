import { useLiveQuery } from "@live-state/sync/client";
import { createFileRoute } from "@tanstack/react-router";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Spinner } from "@workspace/ui/components/spinner";
import { useAsyncAction } from "@workspace/ui/hooks/use-action";
import { cn } from "@workspace/ui/lib/utils";
import { useAtomValue } from "jotai/react";
import { useState } from "react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient, query } from "~/lib/live-state";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/team",
)({
  component: RouteComponent,
});

const roleOptions = [
  { label: "Owner", value: "owner" },
  { label: "User", value: "user" },
];

function RouteComponent() {
  const currentOrg = useAtomValue(activeOrganizationAtom);

  const organizationUsers = useLiveQuery(
    query.organizationUser
      .where({ organizationId: currentOrg?.id })
      .include({ user: true }),
  );

  const { user: currentUser } = Route.useRouteContext();

  const [inviteValue, setInviteValue] = useState<string | null>(null);
  const [isPending, asyncAction] = useAsyncAction();

  if (!currentOrg) return null;

  return (
    <div className="p-4 flex flex-col gap-4 w-full">
      <h2 className="text-base">Members</h2>
      <Card className="bg-[#27272A]/30">
        <CardContent className="gap-0">
          {organizationUsers?.map((orgUser) => (
            <div
              key={orgUser.id}
              className="flex items-center justify-between p-2"
            >
              <div className="flex items-center gap-2.5">
                <Avatar>
                  <AvatarImage src={orgUser.user.image ?? undefined} />
                  <AvatarFallback>{orgUser.user.name.charAt(0)}</AvatarFallback>
                </Avatar>
                {orgUser.user.name}
              </div>
              <div className="flex items-center gap-2">
                <Select value={orgUser.role} items={roleOptions}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  className={cn(
                    "text-red-700 w-24 dark:hover:text-red-500",
                    orgUser.user.id === currentUser?.id &&
                      "opacity-0 pointer-events-none",
                  )}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex gap-4">
        <Input
          value={inviteValue ?? ""}
          onChange={(e) => setInviteValue(e.target.value)}
          className="bg-muted/45 dark:bg-muted/45"
          placeholder="member1@example.com, member2@example.com, ..."
        />
        <Button
          disabled={!inviteValue}
          onClick={async () => {
            if (!inviteValue || !currentOrg?.id) return;

            asyncAction(() =>
              fetchClient.mutate.organizationUser.inviteUser({
                organizationId: currentOrg.id,
                email: inviteValue.split(",").map((email) => email.trim()),
              }),
            ).then(() => {
              setInviteValue(null);
            });
          }}
        >
          {isPending ? <Spinner /> : null}
          Send invitations
        </Button>
      </div>
    </div>
  );
}
