import type { InferLiveObject } from "@live-state/sync";
import { useLiveQuery } from "@live-state/sync/client";
import { ReflagClientProvider } from "@reflag/react-sdk";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Separator } from "@workspace/ui/components/separator";
import { SidebarProvider } from "@workspace/ui/components/sidebar";
import type { schema } from "api/schema";
import { addDays, isAfter } from "date-fns";
import { useAtomValue } from "jotai/react";
import { usePostHog } from "posthog-js/react";
import { useEffect, useState } from "react";
import { Toolbar } from "~/components/devtools/toolbar";
import { activeOrganizationAtom } from "~/lib/atoms";
import { reflagClient } from "~/lib/feature-flag";
import { useOrganizationPlan } from "~/lib/hooks/query/use-organization-plan";
import { useOrganizationSwitcher } from "~/lib/hooks/query/use-organization-switcher";
import { fetchClient, query } from "~/lib/live-state";
import { createCheckoutSession } from "~/lib/server-funcs/payment";

export type WindowWithCachedOrgUsers = Window & {
  cachedOrgUsers?: {
    organizationUsers: InferLiveObject<
      (typeof schema)["organizationUser"],
      { organization: true }
    >[];
  };
};
export const Route = createFileRoute("/app/_workspace")({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    let orgUsers =
      typeof window !== "undefined"
        ? (window as WindowWithCachedOrgUsers).cachedOrgUsers
        : undefined;

    if (orgUsers) {
      return orgUsers;
    }

    const user = context.user;

    orgUsers = {
      organizationUsers: await fetchClient.query.organizationUser
        .forUser({})
        .catch(() => []),
    };

    if (
      !orgUsers.organizationUsers ||
      orgUsers.organizationUsers.length === 0
    ) {
      throw redirect({
        to: "/app/onboarding",
      });
    }

    if (typeof window !== "undefined") {
      (window as WindowWithCachedOrgUsers).cachedOrgUsers = orgUsers;
    }

    return orgUsers;
  },
});

function RouteComponent() {
  // This is needed to set the active organization in the organization switcher
  useOrganizationSwitcher();

  const { user, organizationUsers } = Route.useRouteContext();

  const posthog = usePostHog();

  const currentOrg = useAtomValue(activeOrganizationAtom);

  useEffect(() => {
    if (user?.id) {
      posthog?.identify(user.id, {
        name: user.name,
      });
    }
  }, [user?.id, user?.name, posthog]);

  useEffect(() => {
    if (currentOrg?.id) {
      posthog?.group("organization", currentOrg.id, {
        name: currentOrg.name,
      });
    }
  }, [currentOrg?.id, currentOrg?.name, posthog]);
  const { plan, status, isBetaFeedback } = useOrganizationPlan();

  // Billing (subscription identifiers + trial start) is owner-only. Non-owners
  // are still feature-gated by `plan`/`status` but never see the upgrade flow.
  const isOwner =
    organizationUsers?.some(
      (orgUser) =>
        orgUser.organizationId === currentOrg?.id && orgUser.role === "owner",
    ) ?? false;

  const [subscription, setSubscription] = useState<
    Awaited<ReturnType<typeof fetchClient.query.subscription.forOrg>> | undefined
  >(undefined);

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
        if (!cancelled) setSubscription(result);
      })
      .catch(() => {
        if (!cancelled) setSubscription(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner, currentOrg?.id]);

  const seats =
    useLiveQuery(
      query.organizationUser.where({
        organizationId: currentOrg?.id,
        enabled: true,
      }),
    )?.length ?? 1;

  const proTrialEndDate = subscription?.createdAt
    ? addDays(new Date(subscription.createdAt), 14)
    : null;

  const trialEnded = proTrialEndDate
    ? isAfter(new Date(), proTrialEndDate)
    : false;

  // Only owners see the trial-expired upgrade dialog (they own billing).
  // Don't show it for beta-feedback plans.
  const showTrialExpiredDialog =
    isOwner &&
    plan === "trial" &&
    !isBetaFeedback &&
    trialEnded &&
    status !== "active";

  const [isSubscribing, setIsSubscribing] = useState(false);

  const handleSubscribe = async (planType: "starter" | "pro") => {
    if (!subscription?.customerId) return;
    setIsSubscribing(true);

    try {
      const session = await createCheckoutSession({
        data: {
          customerId: subscription.customerId,
          plan: planType,
          seats: seats,
        },
      });

      if (!session) {
        setIsSubscribing(false);
        return;
      }

      const checkoutUrl = session.checkout_url;

      if (!checkoutUrl) {
        setIsSubscribing(false);
        return;
      }

      window.location.href = checkoutUrl;
    } catch {
      setIsSubscribing(false);
    }
  };

  useEffect(() => {
    reflagClient.initialize();
  }, []);

  return (
    <div className="flex flex-col w-full overflow-hidden h-svh">
      <ReflagClientProvider client={reflagClient}>
        <SidebarProvider className="min-h-0 overflow-hidden">
          <Dialog open={showTrialExpiredDialog} disablePointerDismissal>
            <DialogContent showCloseButton={false} className="max-w-3xl">
              <DialogHeader className="text-left">
                <DialogTitle className="mb-2">
                  Unlock full access to FrontDesk
                </DialogTitle>
                <DialogDescription>
                  Your 14-day free trial has ended. Please choose a plan to
                  continue using FrontDesk.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-4">
                <Card className="bg-[#27272A]/30">
                  <CardContent className="gap-4">
                    <div className="flex justify-between">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col">
                          <div className="text-primary">Starter</div>
                          <div className="text-muted-foreground">
                            $9 per seat/month
                          </div>
                        </div>
                        <div className="w-full max-w-sm">
                          <ul className="flex flex-col gap-2 [&>li]:relative [&>li]:pl-5 [&>li]:before:content-['✓'] [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:text-primary [&>li]:before:font-thin [&>li]:before:text-xs [&>li]:before:top-1/2 [&>li]:before:-translate-y-1/2">
                            <li>Unlimited support tickets</li>
                            <li>Unlimited customers</li>
                            <li>Public support portal</li>
                            <li>2 support channels</li>
                          </ul>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => handleSubscribe("starter")}
                        disabled={isSubscribing}
                      >
                        Subscribe
                      </Button>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col">
                          <div className="text-primary">Pro</div>
                          <div className="text-muted-foreground">
                            $24 per seat/month
                          </div>
                        </div>
                        <div className="w-full max-w-sm">
                          <ul className="flex flex-col gap-2 [&>li]:relative [&>li]:pl-5 [&>li]:before:content-['✓'] [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:text-primary [&>li]:before:font-thin [&>li]:before:text-xs [&>li]:before:top-1/2 [&>li]:before:-translate-y-1/2">
                            <li>Unlimited support tickets</li>
                            <li>Unlimited customers</li>
                            <li>Public support portal with custom domain</li>
                            <li>Unlimited support channels</li>
                          </ul>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleSubscribe("pro")}
                        disabled={isSubscribing}
                        variant="primary"
                      >
                        Subscribe
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </DialogContent>
          </Dialog>
          <Outlet />
        </SidebarProvider>
        {import.meta.env.DEV && <Toolbar />}
      </ReflagClientProvider>
    </div>
  );
}
