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
import { addDays, format, formatDistanceToNowStrict, isAfter } from "date-fns";
import type { DodoPayments } from "dodopayments/client";
import { useAtomValue } from "jotai/react";
import { useEffect, useState } from "react";

import { activeOrganizationAtom } from "~/lib/atoms";
import { useOrganizationPlan } from "~/lib/hooks/query/use-organization-plan";
import { fetchClient, query } from "~/lib/live-state";
import {
  cancelSubscription,
  createCheckoutSession,
  getPastInvoices,
  updateSubscription,
} from "~/lib/server-funcs/payment";
import { seo } from "~/utils/seo";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/billing"
)({
  component: RouteComponent,
  head: () => ({
    meta: [
      ...seo({
        title: "Billing - FrontDesk",
        description: "Manage your subscription and billing",
      }),
    ],
  }),
});

function RouteComponent() {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const { plan, isBetaFeedback } = useOrganizationPlan();
  const { organizationUsers } = Route.useRouteContext();

  // `subscription.forOrg` is owner-only server-side; mirror that here so
  // non-owners skip the wasted call and its silently-caught error.
  const isOwner =
    organizationUsers?.some(
      (orgUser) =>
        orgUser.organizationId === currentOrg?.id && orgUser.role === "owner"
    ) ?? false;

  // Billing identifiers (customerId/subscriptionId) are owner-only and no longer
  // synced into the local store; fetch the full subscription on demand.
  const [subscription, setSubscription] = useState<
    | Awaited<ReturnType<typeof fetchClient.query.subscription.forOrg>>
    | undefined
  >();

  useEffect(() => {
    if (!isOwner || !currentOrg?.id) {
      setSubscription(undefined);
      return;
    }
    // Guard against out-of-order responses when switching orgs so billing state
    // only ever reflects the latest fetch.
    let cancelled = false;
    fetchClient.query.subscription
      .forOrg({ organizationId: currentOrg.id })
      .then((result) => {
        if (!cancelled) {
          setSubscription(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSubscription(undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner, currentOrg?.id]);

  const seats =
    useLiveQuery(
      query.organizationUser.where({
        enabled: true,
        organizationId: currentOrg?.id,
      })
    )?.length ?? 1;

  const [isLoading, setIsLoading] = useState(true);
  const [pastInvoices, setPastInvoices] = useState<
    DodoPayments.PaymentListResponse[]
  >([]);
  // TODO use tanstack query instead
  useEffect(() => {
    if (!subscription?.customerId) {
      setIsLoading(false);
      return;
    }
    getPastInvoices({ data: { customerId: subscription.customerId } })
      .then((invoices) => {
        setPastInvoices(invoices);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [subscription?.customerId]);

  if (!currentOrg) {
    return null;
  }

  const proTrialEndDate = subscription?.createdAt
    ? addDays(new Date(subscription.createdAt), 14)
    : null;

  const trialEnded = proTrialEndDate
    ? isAfter(new Date(), proTrialEndDate)
    : false;

  return (
    <>
      <div className="p-4 flex flex-col gap-4 w-full">
        <h2 className="text-base">Billing</h2>
        {plan === "trial" && !isBetaFeedback && (
          <Card className="bg-[#27272A]/30">
            <CardContent className="flex-row justify-between items-center">
              <div>
                <div className="text-muted-foreground">Current plan</div>
                <div className="text-primary">Trial</div>
              </div>
              <div className="text-muted-foreground">
                Your Pro free trial{" "}
                {proTrialEndDate &&
                  (trialEnded
                    ? "ended"
                    : `ends ${formatDistanceToNowStrict(proTrialEndDate, {
                        addSuffix: true,
                      })}`)}
                .
              </div>
            </CardContent>
          </Card>
        )}
        <Card className="bg-[#27272A]/30">
          <CardContent
            className={cn("gap-4", plan === "pro" && "flex-col-reverse")}
          >
            <div className="flex justify-between">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col">
                  {(plan === "starter" || isBetaFeedback) && (
                    <div className="text-muted-foreground">Current plan</div>
                  )}
                  <div className="text-primary">
                    {isBetaFeedback ? "Beta Feedback (Free)" : "Starter"}
                  </div>
                  {plan !== "starter" && !isBetaFeedback && (
                    <div className="text-muted-foreground">$9/seat/month</div>
                  )}
                </div>
                {plan !== "starter" && !isBetaFeedback && (
                  <div className="w-full max-w-sm">
                    <ul className="lex flex-col gap-2 [&>li]:relative [&>li]:pl-5 [&>li]:before:content-['✓'] [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:text-primary [&>li]:before:font-thin [&>li]:before:text-xs [&>li]:before:top-1/2 [&>li]:before:-translate-y-1/2">
                      <li>Unlimited support tickets</li>
                      <li>Unlimited customers</li>
                      <li>Public support portal</li>
                      <li>2 support channels</li>
                    </ul>
                  </div>
                )}
              </div>
              {plan !== "starter" &&
                !isBetaFeedback &&
                subscription?.subscriptionId && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant={plan === "pro" ? "secondary" : "primary"}
                      >
                        {plan === "pro" ? "Downgrade" : "Upgrade"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {plan === "pro"
                            ? "Downgrade to Starter plan?"
                            : "Upgrade to Starter plan?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {plan === "pro"
                            ? "You are about to downgrade your subscription to the Starter plan. The value difference will be pro-rated and applied to your next billing cycle."
                            : "You are about to upgrade your subscription to the Starter plan. The value difference will be pro-rated and applied to your next billing cycle."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={async () => {
                            if (!subscription) {
                              return;
                            }
                            if (!subscription.customerId) {
                              return;
                            }

                            await updateSubscription({
                              data: {
                                customerId: subscription.customerId,
                                plan: "starter",
                                seats,
                              },
                            });
                          }}
                        >
                          Confirm
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              {plan !== "starter" &&
                !isBetaFeedback &&
                !subscription?.subscriptionId && (
                  <Button
                    onClick={async () => {
                      if (!subscription) {
                        return;
                      }
                      if (!subscription.customerId) {
                        return;
                      }

                      const session = await createCheckoutSession({
                        data: {
                          customerId: subscription.customerId,
                          plan: "starter",
                          seats,
                        },
                      });

                      if (!session) {
                        return;
                      }

                      const checkoutUrl = session.checkout_url;

                      if (!checkoutUrl) {
                        return;
                      }

                      window.location.href = checkoutUrl;
                    }}
                    variant={plan === "pro" ? "secondary" : "primary"}
                  >
                    {plan === "pro" ? "Downgrade" : "Upgrade"}
                  </Button>
                )}
            </div>
            <Separator />
            <div className="flex justify-between">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col">
                  {plan === "pro" && (
                    <div className="text-muted-foreground">Current plan</div>
                  )}
                  <div className="text-primary">Pro</div>
                  {plan !== "pro" && (
                    <div className="text-muted-foreground">$24/seat/month</div>
                  )}
                </div>
                {plan !== "pro" && (
                  <div className="w-full max-w-sm">
                    <ul className="lex flex-col gap-2 [&>li]:relative [&>li]:pl-5 [&>li]:before:content-['✓'] [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:text-primary [&>li]:before:font-thin [&>li]:before:text-xs [&>li]:before:top-1/2 [&>li]:before:-translate-y-1/2">
                      <li>Unlimited support tickets</li>
                      <li>Unlimited customers</li>
                      <li>Public support portal with custom domain</li>
                      <li>Unlimited support channels</li>
                    </ul>
                  </div>
                )}
              </div>
              {plan !== "pro" && subscription?.subscriptionId && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button>Upgrade</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Upgrade to Pro plan?</AlertDialogTitle>
                      <AlertDialogDescription>
                        You are about to upgrade your subscription to the Pro
                        plan. The value difference will be pro-rated and applied
                        to your next billing cycle.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          if (!subscription) {
                            return;
                          }
                          if (!subscription.customerId) {
                            return;
                          }

                          await updateSubscription({
                            data: {
                              customerId: subscription.customerId,
                              plan: "pro",
                              seats,
                            },
                          });
                        }}
                      >
                        Confirm
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {plan !== "pro" && !subscription?.subscriptionId && (
                <Button
                  onClick={async () => {
                    if (!subscription) {
                      return;
                    }
                    if (!subscription.customerId) {
                      return;
                    }

                    const session = await createCheckoutSession({
                      data: {
                        customerId: subscription.customerId,
                        plan: "pro",
                        seats,
                      },
                    });

                    if (!session) {
                      return;
                    }

                    const checkoutUrl = session.checkout_url;

                    if (!checkoutUrl) {
                      return;
                    }

                    window.location.href = checkoutUrl;
                  }}
                >
                  Upgrade
                </Button>
              )}
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
                      <Skeleton className="w-12 h-4" />
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
                            : "text-yellow-700"
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
      {subscription?.status && (
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
                      disabled={subscription?.status === "cancelled"}
                    >
                      {subscription?.status === "cancelled"
                        ? "Already cancelled"
                        : "Cancel subscription"}
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
                          if (!subscription?.customerId) {
                            return;
                          }
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
      )}
    </>
  );
}
