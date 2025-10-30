import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { useAtomValue } from "jotai/react";
import { activeOrganizationAtom } from "~/lib/atoms";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/billing",
)({
  component: RouteComponent,
});

const roleOptions = [
  { label: "Owner", value: "owner" },
  { label: "User", value: "user" },
];

function RouteComponent() {
  const currentOrg = useAtomValue(activeOrganizationAtom);

  if (!currentOrg) return null;

  return (
    <>
      <div className="p-4 flex flex-col gap-4 w-full">
        <h2 className="text-base">Billing</h2>
        <Card className="bg-[#27272A]/30">
          <CardContent className="gap-4">
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <div className="text-muted-foreground">Current plan</div>
                <div className="text-primary">Starter</div>
              </div>
              <Button variant="secondary">Payment settings</Button>
            </div>
            <Separator />
            <div className="flex justify-between">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col">
                  <div className="text-primary">Pro</div>
                  <div className="text-muted-foreground">$24/seat/month</div>
                </div>
                <div className="w-full max-w-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <ul className="lex flex-col gap-2 [&>li]:relative [&>li]:pl-5 [&>li]:before:content-['✓'] [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:text-primary [&>li]:before:font-thin [&>li]:before:text-xs [&>li]:before:top-1/2 [&>li]:before:-translate-y-1/2">
                      <li>Unlimited support tickets</li>
                      <li>Unlimited customers</li>
                      <li>Public support portal</li>
                      <li>2 support channels</li>
                    </ul>
                  </div>
                </div>
              </div>
              <Button>Upgrade</Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="p-4 flex flex-col gap-4 w-full">
        <h2 className="text-base">Recent invoices</h2>
        <Card className="bg-[#27272A]/30">
          <CardContent className="gap-4">
            <div className="text-muted-foreground">No invoices found</div>
          </CardContent>
        </Card>
      </div>
      <div className="p-4 flex flex-col gap-4 w-full">
        <h2 className="text-base">Danger zone</h2>
        <Card className="bg-[#27272A]/30">
          <CardContent className="gap-4">
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <div>Cancel subscription</div>
                <div className="text-muted-foreground">
                  You will lose access to the Pro plan on 2026-01-01
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-700 dark:hover:text-red-700"
              >
                Cancel subscription
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
