import { useLiveQuery } from "@live-state/sync/client";
import { createFileRoute, Link } from "@tanstack/react-router";
import { slackIntegrationSchema } from "@workspace/schemas/integration/slack";
import {
  RichText,
  TruncatedText,
} from "@workspace/ui/components/blocks/tiptap";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { InputWithSeparator } from "@workspace/ui/components/input";
import { Separator } from "@workspace/ui/components/separator";
import { Switch } from "@workspace/ui/components/switch";
import { useAtomValue } from "jotai/react";
import { ArrowLeft } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback } from "react";
import { ulid } from "ulid";
import type { z } from "zod";
import { LimitCallout } from "~/components/integration-settings/limit-callout";
import { activeOrganizationAtom } from "~/lib/atoms";
import { usePlanLimits } from "~/lib/hooks/query/use-plan-limits";
import { fetchClient, mutate, query } from "~/lib/live-state";
import { seo } from "~/utils/seo";
import { integrationOptions } from "..";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/integration/slack/"
)({
  component: RouteComponent,
  head: () => {
    return {
      meta: [
        ...seo({
          title: "Slack Integration - FrontDesk",
          description: "Configure Slack integration",
        }),
      ],
    };
  },
});

// biome-ignore lint/style/noNonNullAssertion: This is a constant and we know it will always be found
const integrationDetails = integrationOptions.find(
  (option) => option.id === "slack"
)!;

// Slack bot scopes - chat:write, channels:read, channels:history, groups:read, im:read, users:read
const SLACK_BOT_SCOPES = [
  "channels:history",
  "channels:read",
  "chat:write",
  "chat:write.customize",
  "groups:history",
  "groups:read",
  "im:read",
  "users:read",
].join(",");

const generateStateToken = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
};

function RouteComponent() {
  const posthog = usePostHog();
  const activeOrg = useAtomValue(activeOrganizationAtom);
  const integration = useLiveQuery(
    query.integration.first({ organizationId: activeOrg?.id, type: "slack" })
  );

  const { integrations } = usePlanLimits("slack");

  const parsedConfig: ReturnType<
    typeof slackIntegrationSchema.safeParse
  > | null = (() => {
    if (!integration?.configStr) return null;
    try {
      return slackIntegrationSchema.safeParse(
        JSON.parse(integration.configStr)
      );
    } catch {
      return {
        // TODO: this wont be required once we have a proper JSON type in live-state
        // keep shape compatible with safeParse result
        success: false as const,
        error: new Error("Invalid JSON in integration.configStr"),
      } as ReturnType<typeof slackIntegrationSchema.safeParse>;
    }
  })();

  const updateIntegration = useCallback(
    (
      config: z.input<typeof slackIntegrationSchema>,
      enabled: boolean = true
    ) => {
      if (integration) {
        mutate.integration.update(integration.id, {
          enabled,
          updatedAt: new Date(),
          configStr: JSON.stringify({
            ...(parsedConfig?.data ?? {}),
            ...config,
          }),
        });
      } else if (activeOrg?.id) {
        mutate.integration.insert({
          id: ulid().toLowerCase(),
          organizationId: activeOrg?.id,
          type: "slack",
          enabled,
          createdAt: new Date(),
          updatedAt: new Date(),
          configStr: JSON.stringify({
            ...(parsedConfig?.data ?? {}),
            ...config,
          }),
        });
      }
    },
    [integration, activeOrg, parsedConfig?.data]
  );

  const handleEnableSlack = async () => {
    if (integrations.hasReachedLimit) {
      return;
    }

    const SLACK_CLIENT_ID = import.meta.env.VITE_SLACK_CLIENT_ID;

    if (!SLACK_CLIENT_ID) {
      console.error("[Slack] Client ID is not configured");
      return;
    }

    if (!activeOrg?.id) {
      console.error("[Slack] No active organization selected");
      return;
    }

    const csrfToken = generateStateToken();

    if (integration) {
      await fetchClient.mutate.integration.update(integration.id, {
        enabled: false,
        updatedAt: new Date(),
        configStr: JSON.stringify({
          ...(parsedConfig?.data ?? {}),
          csrfToken,
        }),
      });
    } else if (activeOrg?.id) {
      await fetchClient.mutate.integration.insert({
        id: ulid().toLowerCase(),
        organizationId: activeOrg?.id,
        type: "slack",
        enabled: false,
        updatedAt: new Date(),
        createdAt: new Date(),
        configStr: JSON.stringify({
          ...(parsedConfig?.data ?? {}),
          csrfToken,
        }),
      });
    }

    const baseUrl = window.location.href
      .replace(/[?#].*$/, "")
      .replace(/\/$/, "");
    const redirectUri = `${
      import.meta.env.DEV ? "https://redirectmeto.com/" : ""
    }${baseUrl}/redirect`;

    const queryParams = new URLSearchParams({
      client_id: SLACK_CLIENT_ID,
      scope: SLACK_BOT_SCOPES,
      redirect_uri: redirectUri,
      state: `${activeOrg?.id}_${csrfToken}`,
    });

    // https://api.slack.com/authentication/oauth-v2
    const slackOAuthUrl = `https://slack.com/oauth/v2/authorize?${queryParams.toString()}`;

    posthog?.capture("integration_enable", {
      integration_type: "slack",
    });

    // Wait briefly to ensure analytics event is transmitted before navigation
    await new Promise((resolve) => setTimeout(resolve, 300));

    window.location.href = slackOAuthUrl;
  };

  if (parsedConfig && !parsedConfig.success) {
    // TODO Handle this better

    console.error(
      "Invalid Slack integration configuration",
      parsedConfig.error
    );

    return (
      <p className="text-center">
        Your Slack integration is not configured correctly.{" "}
        <a href="mailto:support@tryfrontdesk.app" className="underline">
          Please contact support.
        </a>
      </p>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        render={
          <Link to="/app/settings/organization/integration">
            <ArrowLeft />
            Integrations
          </Link>
        }
        className="absolute top-2 left-1"
      />
      <div className="flex flex-col gap-4 pt-12">
        {integrations.hasReachedLimit && <LimitCallout className="mb-4" />}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {integrationDetails.icon}
            <div>
              <h1 className="text-base">{integrationDetails.label}</h1>
              <h2 className="text-muted-foreground">
                {integrationDetails.description}
              </h2>
            </div>
          </div>
          {!integration?.enabled && (
            <div className="flex gap-5 items-center">
              <div>
                <h3 className="text-muted-foreground">Built by</h3>
                <p>FrontDesk</p>
              </div>
              <Button
                onClick={handleEnableSlack}
                disabled={integrations.hasReachedLimit}
              >
                Enable
              </Button>
            </div>
          )}
        </div>
        <Card className="bg-muted/30">
          <CardContent>
            {!integration?.enabled ? (
              <>
                <TruncatedText>
                  <RichText content={integrationDetails.fullDescription} />
                </TruncatedText>
              </>
            ) : (
              <>
                <div className="flex gap-8 items-center justify-between">
                  <div className="flex flex-col">
                    <div>Support channels</div>
                    <div className="text-muted-foreground">
                      Channels where support threads will be created
                    </div>
                  </div>
                  <InputWithSeparator
                    placeholder="support-channel, help-channel, ..."
                    className="w-64"
                    value={parsedConfig?.data?.selectedChannels ?? []}
                    onValueChange={(value) => {
                      updateIntegration({ selectedChannels: value });
                    }}
                  />
                </div>
                <div className="flex gap-8 items-center justify-between">
                  <div className="flex flex-col">
                    <div>Send portal link on new threads</div>
                    <div className="text-muted-foreground">
                      Send a message in Slack with a link to the same thread in
                      the portal
                    </div>
                  </div>
                  <Switch
                    checked={parsedConfig?.data?.showPortalMessage !== false}
                    onCheckedChange={(checked) => {
                      updateIntegration({ showPortalMessage: checked });
                    }}
                  />
                </div>

                <Separator />
                <div className="flex gap-5 items-center">
                  Disable integration
                  <Button
                    variant="ghost"
                    className="ml-auto text-red-700 dark:hover:text-red-500"
                    onClick={() => {
                      mutate.integration.update(integration?.id, {
                        enabled: false,
                        updatedAt: new Date(),
                      });
                    }}
                  >
                    Disable
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
