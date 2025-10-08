import { useLiveQuery } from "@live-state/sync/client";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
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
import { Separator } from "@workspace/ui/components/separator";
import { Spinner } from "@workspace/ui/components/spinner";
import { useAsyncAction } from "@workspace/ui/hooks/use-action";
import { cn } from "@workspace/ui/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { useAtomValue } from "jotai/react";
import { useState } from "react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient, mutate, query } from "~/lib/live-state";

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
      .where({ organizationId: currentOrg?.id, enabled: true })
      .include({ user: true }),
  );

  const invites = useLiveQuery(
    query.invite.where({ organizationId: currentOrg?.id, active: true }),
  );

  const { user: currentUser } = Route.useRouteContext();

  const selfOrgUser = organizationUsers?.find(
    (orgUser) => orgUser.user.id === currentUser?.id,
  );

  const [inviteValue, setInviteValue] = useState<string | null>(null);
  const [isPending, asyncAction] = useAsyncAction();

  if (!currentOrg || !selfOrgUser) return null;

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
                <Select
                  value={orgUser.role}
                  items={roleOptions}
                  onValueChange={(value) => {
                    mutate.organizationUser.update(orgUser.id, {
                      role: value as string,
                    });
                  }}
                >
                  <SelectTrigger
                    className="w-40"
                    disabled={
                      orgUser.user.id === currentUser?.id ||
                      selfOrgUser.role !== "owner"
                    }
                  >
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
                {selfOrgUser.role === "owner" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
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
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Are you absolutely sure?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will remove{" "}
                          <strong>{orgUser.user.name}</strong> from the
                          organization.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => {
                            mutate.organizationUser.update(orgUser.id, {
                              enabled: false,
                            });
                          }}
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          ))}
          {invites?.length && selfOrgUser.role === "owner" && (
            <div className="flex flex-col gap-px px-2">
              <Separator className="my-6" />
              <h2 className="mb-4 text-primary/85">Pending invitations</h2>
              {invites?.map((invite) => (
                <div
                  key={invite.id}
                  className="grid grid-cols-3 items-center h-8 gap-4"
                >
                  <div>{invite.email}</div>
                  <span className="text-xs text-muted-foreground">
                    Expires in {formatDistanceToNowStrict(invite.expiresAt)}
                  </span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-700 w-24 dark:hover:text-red-500 justify-self-end px-4"
                      >
                        Revoke
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Are you absolutely sure?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will revoke the
                          invitation for <strong>{invite.email}</strong>.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => {
                            mutate.invite.update(invite.id, {
                              active: false,
                            });
                          }}
                        >
                          Revoke
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {selfOrgUser.role === "owner" && (
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
      )}
    </div>
  );
}
