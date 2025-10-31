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
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import { format } from "date-fns";
import type { DodoPayments } from "dodopayments/client";
import { useAtomValue } from "jotai/react";
import { useEffect, useState } from "react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { query } from "~/lib/live-state";
import {
  cancelSubscription,
  createCheckoutSession,
  createCustomerPortalSession,
  getPastInvoices,
} from "~/lib/server-funcs/payment";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/billing",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const currentOrg = useAtomValue(activeOrganizationAtom);

  const subscription = useLiveQuery(
    query.subscription.first({
      organizationId: currentOrg?.id,
    }),
  );

  const seats =
    useLiveQuery(
      query.organizationUser.where({
        organizationId: currentOrg?.id,
        enabled: true,
      }),
    )?.length ?? 1;

  const [isLoading, setIsLoading] = useState(true);
  const [pastInvoices, setPastInvoices] = useState<
    DodoPayments.PaymentListResponse[]
  >([]);

  useEffect(() => {
    if (!subscription?.customerId) return;
    getPastInvoices({ data: { customerId: subscription.customerId } })
      .then((invoices) => {
        setPastInvoices(invoices);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

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
              <Button
                variant="secondary"
                onClick={async () => {
                  if (!subscription?.customerId) return;
                  const session = await createCustomerPortalSession({
                    data: {
                      customerId: subscription?.customerId,
                    },
                  });
                  if (!session) return;
                  window.location.href = session.link;
                }}
              >
                Payment settings
              </Button>
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
              <Button
                onClick={async () => {
                  if (!subscription) return;
                  if (!subscription.customerId) return;

                  // TODO Change this to subscription change call
                  const session = await createCheckoutSession({
                    data: {
                      customerId: subscription.customerId,
                      // TODO change this to pro
                      plan: "starter",
                      seats: seats,
                    },
                  });

                  console.log("Session", session);

                  if (!session) return;

                  window.location.href = session.checkout_url;
                }}
              >
                Upgrade
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="p-4 flex flex-col gap-4 w-full">
        <h2 className="text-base">Recent invoices</h2>
        <Card className="bg-[#27272A]/30">
          <CardContent className="gap-4">
            {isLoading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: dummy key
                    key={index}
                    className="flex items-center gap-4 justify-between"
                  >
                    <div className="flex gap-2">
                      <Skeleton className="w-24 h-4" />
                      <Skeleton className="w-24 h-4" />
                    </div>
                    <Skeleton className="w-24 h-4" />
                  </div>
                ))}
              </div>
            ) : pastInvoices.length > 0 ? (
              <div className="flex flex-col gap-2">
                {pastInvoices.map((invoice) => (
                  <div
                    key={invoice.payment_id}
                    className="flex items-center gap-4 justify-between"
                  >
                    <div className="flex gap-2">
                      <div>
                        {new Intl.NumberFormat(undefined, {
                          style: "currency",
                          currency: invoice.currency,
                        }).format(invoice.total_amount / 100)}
                      </div>
                      <div className="text-muted-foreground">
                        {format(new Date(invoice.created_at), "dd MMM. yyyy")}
                      </div>
                    </div>
                    <div
                      className={cn(
                        invoice.status === "succeeded"
                          ? "text-green-700"
                          : invoice.status === "failed"
                            ? "text-red-700"
                            : "text-yellow-700",
                      )}
                    >
                      {invoice.status === "succeeded"
                        ? "Success"
                        : invoice.status === "failed"
                          ? "Failed"
                          : "Processing"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground">No invoices found</div>
            )}
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
                  You would lose access by the end of the current billing
                  period.
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-700 dark:hover:text-red-700"
                    disabled={subscription?.status !== "active"}
                  >
                    {subscription?.status === "active"
                      ? "Cancel subscription"
                      : "Already cancelled"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Are you absolutely sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      You would lose access by the end of the current billing
                      period.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={async () => {
                        if (!subscription?.customerId) return;
                        await cancelSubscription({
                          data: {
                            customerId: subscription.customerId,
                          },
                        });
                      }}
                    >
                      Cancel subscription
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
