import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Logo } from "@workspace/ui/components/logo";
import { Spinner } from "@workspace/ui/components/spinner";
import { createStandardSchemaV1, parseAsString, useQueryState } from "nuqs";
import { usePostHog } from "posthog-js/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLogout } from "~/lib/hooks/auth";
import { activateDiscord, activateSlack } from "~/lib/integrations/activate";
import { fetchClient } from "~/lib/live-state";
import { seo } from "~/utils/seo";
import { integrationOptions } from "../_workspace/settings/organization/integration";

const searchParams = {
  name: parseAsString.withDefault(""),
  slug: parseAsString.withDefault(""),
  orgId: parseAsString.withDefault(""),
};

export const Route = createFileRoute("/app/onboarding/connect")({
  component: RouteComponent,
  validateSearch: createStandardSchemaV1(searchParams, {
    partialOutput: true,
  }),
  head: () => {
    return {
      meta: [
        ...seo({
          title: "Connect Communities - FrontDesk",
          description: "Connect your communities to FrontDesk",
        }),
      ],
    };
  },
});

// biome-ignore lint/style/noNonNullAssertion: Known constants
const discordDetails = integrationOptions.find((o) => o.id === "discord")!;
// biome-ignore lint/style/noNonNullAssertion: Known constants
const slackDetails = integrationOptions.find((o) => o.id === "slack")!;

function RouteComponent() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const posthog = usePostHog();
  const logout = useLogout();
  const createdRef = useRef(false);

  const [name, setName] = useQueryState("name", parseAsString.withDefault(""));
  const [slug, setSlug] = useQueryState("slug", parseAsString.withDefault(""));
  const [orgId, setOrgId] = useQueryState(
    "orgId",
    parseAsString.withDefault(""),
  );
  const [pendingConnect, setPendingConnect] = useState<
    "discord" | "slack" | null
  >(null);

  // Create the organization on mount
  useEffect(() => {
    if (createdRef.current) return;
    if (!name || !slug) return;
    createdRef.current = true;

    fetchClient.mutate.organization
      .create({ name, slug })
      .then((data) => {
        posthog?.capture("onboarding:organization_create");
        // Replace search params with just orgId
        setName("");
        setSlug("");
        setOrgId(data.organization.id);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Failed to create organization";
        toast.error(message);
        navigate({ to: "/app/onboarding/new" });
      });
  }, [name, slug, posthog, navigate, setName, setSlug, setOrgId]);

  // Deferred path: run activation only when pendingConnect was set before orgId was available
  useEffect(() => {
    if (!orgId || !pendingConnect) return;
    const showError = (err: unknown, label: string) => {
      const message =
        err instanceof Error ? err.message : `Failed to connect ${label}`;
      toast.error(message);
    };
    const clearPending = () => setPendingConnect(null);
    if (pendingConnect === "discord") {
      activateDiscord({ organizationId: orgId, posthog })
        .catch((err) => showError(err, "Discord"))
        .finally(clearPending);
    } else {
      activateSlack({ organizationId: orgId, posthog })
        .catch((err) => showError(err, "Slack"))
        .finally(clearPending);
    }
  }, [orgId, pendingConnect, posthog]);

  const handleConnectDiscord = async () => {
    if (orgId) {
      try {
        await activateDiscord({ organizationId: orgId, posthog });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to connect Discord";
        toast.error(message);
      }
    } else {
      setPendingConnect("discord");
    }
  };

  const handleConnectSlack = async () => {
    if (orgId) {
      try {
        await activateSlack({ organizationId: orgId, posthog });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to connect Slack";
        toast.error(message);
      }
    } else {
      setPendingConnect("slack");
    }
  };

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-muted/20">
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
        <h1 className="text-xl font-medium">Connect your communities</h1>
        <p className="text-muted-foreground text-center text-sm">
          Upgrade your Discord or Slack community with smart support tools, AI
          insights, and seamless organization.
        </p>
        <div className="flex flex-col gap-3 w-full">
          <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              {discordDetails.icon}
              <div>
                <div className="font-medium">{discordDetails.label}</div>
                <div className="text-sm text-muted-foreground">
                  {discordDetails.description}
                </div>
              </div>
            </div>
            <Button onClick={handleConnectDiscord} disabled={!!pendingConnect}>
              {pendingConnect === "discord" ? (
                <>
                  <Spinner /> Setting up...
                </>
              ) : (
                "Connect"
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              {slackDetails.icon}
              <div>
                <div className="font-medium">{slackDetails.label}</div>
                <div className="text-sm text-muted-foreground">
                  {slackDetails.description}
                </div>
              </div>
            </div>
            <Button onClick={handleConnectSlack} disabled={!!pendingConnect}>
              {pendingConnect === "slack" ? (
                <>
                  <Spinner /> Setting up...
                </>
              ) : (
                "Connect"
              )}
            </Button>
          </div>
        </div>
        <Button
          variant="link"
          className="text-muted-foreground"
          render={<Link to="/app" />}
        >
          I&apos;ll do this later
        </Button>
      </div>
    </div>
  );
}
