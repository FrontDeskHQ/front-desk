import { useLiveQuery } from "@live-state/sync/client";
import { useFlag } from "@reflag/react-sdk";
import { createFileRoute } from "@tanstack/react-router";
import { linearIntegrationSchema } from "@workspace/schemas/integration/linear";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Separator } from "@workspace/ui/components/separator";
import { useAtomValue } from "jotai/react";
import { usePostHog } from "posthog-js/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { ulid } from "ulid";
import { z } from "zod";

import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient, mutate, query } from "~/lib/live-state";
import { seo } from "~/utils/seo";

import { requireIntegrationOption } from "..";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/integration/linear/"
)({
  component: RouteComponent,
  validateSearch: z.object({ error: z.string().optional() }),
  staticData: { breadcrumb: "Linear" },
  head: () => ({
    meta: [
      ...seo({
        description: "Configure the Linear integration",
        title: "Linear Integration - FrontDesk",
      }),
    ],
  }),
});

const details = requireIntegrationOption("linear");

function RouteComponent() {
  const { isEnabled } = useFlag("linear-integration");
  const organization = useAtomValue(activeOrganizationAtom);
  const posthog = usePostHog();
  const { error: oauthError } = Route.useSearch();
  const integration = useLiveQuery(
    query.integration.first({
      organizationId: organization?.id,
      type: "linear",
    })
  );

  useEffect(() => {
    if (oauthError) {
      toast.error("Linear connection failed. Try again.");
    }
  }, [oauthError]);

  if (!(isEnabled && organization)) {
    return null;
  }

  const parsed = (() => {
    if (!integration?.configStr) return null;
    try {
      return linearIntegrationSchema.safeParse(
        JSON.parse(integration.configStr)
      );
    } catch {
      return null;
    }
  })();
  const config = parsed?.success ? parsed.data : null;

  const connect = async () => {
    const clientId = import.meta.env.VITE_LINEAR_CLIENT_ID;
    const connectorBaseUrl =
      import.meta.env.VITE_BASE_LINEAR_CONNECTOR_URL ??
      (import.meta.env.DEV ? "http://localhost:3336/linear" : undefined);
    if (!(clientId && connectorBaseUrl)) {
      toast.error("Linear OAuth is not configured.");
      return;
    }

    const integrationId = integration?.id ?? ulid().toLowerCase();
    let csrfToken: string;
    try {
      if (!integration) {
        await fetchClient.mutate.integration.connectInstallation({
          configStr: JSON.stringify(config ?? {}),
          createdAt: new Date(),
          enabled: false,
          id: integrationId,
          organizationId: organization.id,
          type: "linear",
          updatedAt: new Date(),
        });
      }
      const pending = await fetchClient.mutate.integration.beginLinearOAuth({
        integrationId,
      });
      csrfToken = pending.state;
    } catch {
      toast.error("Could not start the Linear connection. Try again.");
      return;
    }

    const redirectUri = `${connectorBaseUrl}/api/oauth/callback`;
    const params = new URLSearchParams({
      actor: "app",
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "read,issues:create",
      state: `${integrationId}.${csrfToken}`,
    });
    posthog?.capture("integration_enable", { integration_type: "linear" });
    await new Promise((resolve) => setTimeout(resolve, 300));
    window.location.href = `https://linear.app/oauth/authorize?${params.toString()}`;
  };

  const setDefaultTeam = async (teamId: string) => {
    if (!(integration && config)) return;
    try {
      await mutate.integration.updateInstallation({
        configStr: JSON.stringify({ ...config, defaultTeamId: teamId }),
        integrationId: integration.id,
        updatedAt: new Date(),
      });
    } catch {
      toast.error("Could not update the default Linear team.");
    }
  };

  const disable = async () => {
    if (!integration) return;
    try {
      await mutate.integration.updateInstallation({
        enabled: false,
        integrationId: integration.id,
        updatedAt: new Date(),
      });
    } catch {
      toast.error("Could not disable the Linear integration.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {details.icon}
          <div>
            <h1 className="text-base">{details.label}</h1>
            <h2 className="text-muted-foreground">{details.description}</h2>
          </div>
        </div>
        {!integration?.enabled && (
          <Button onClick={connect}>Connect Linear</Button>
        )}
      </div>
      <Card className="bg-muted/30">
        <CardContent className="flex flex-col gap-4">
          {integration?.enabled && config ? (
            <>
              <div>
                <div>Connected workspace</div>
                <div className="text-sm text-muted-foreground">
                  {config.workspaceName}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div>Default team</div>
                <div className="text-sm text-muted-foreground">
                  Support Intelligence creates Linear issues in this team.
                </div>
                <Select
                  value={config.defaultTeamId ?? config.teams[0]?.id ?? null}
                  items={config.teams.map((team) => ({
                    label: `${team.key} — ${team.name}`,
                    value: team.id,
                  }))}
                  onValueChange={(value) =>
                    void setDefaultTeam(value as string)
                  }
                >
                  <SelectTrigger
                    className="w-72"
                    aria-label="Default Linear team"
                  >
                    <SelectValue placeholder="Select a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {config.teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.key} — {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={connect}>
                  Reconnect
                </Button>
                <Button
                  className="ml-auto text-red-700 dark:hover:text-red-500"
                  variant="ghost"
                  onClick={() => void disable()}
                >
                  Disable
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Connect one Linear workspace with read access and permission to
              create issues. FrontDesk will not change Linear issue statuses.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
