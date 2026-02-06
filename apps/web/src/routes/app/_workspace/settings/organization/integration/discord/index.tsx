import { useLiveQuery } from "@live-state/sync/client";
import { createFileRoute, Link } from "@tanstack/react-router";
import { discordIntegrationSchema } from "@workspace/schemas/integration/discord";
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
import { IntegrationWarningCallout } from "~/components/integration-settings/warning-callout";
import { LimitCallout } from "~/components/integration-settings/limit-callout";
import { activateDiscord } from "~/lib/integrations/activate";
import { activeOrganizationAtom } from "~/lib/atoms";
import { usePlanLimits } from "~/lib/hooks/query/use-plan-limits";
import { mutate, query } from "~/lib/live-state";
import { seo } from "~/utils/seo";
import { integrationOptions } from "..";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/integration/discord/"
)({
  component: RouteComponent,
  head: () => {
    return {
      meta: [
        ...seo({
          title: "Discord Integration - FrontDesk",
          description: "Configure Discord integration",
        }),
      ],
    };
  },
});

// biome-ignore lint/style/noNonNullAssertion: This is a constant and we know it will always be found
const integrationDetails = integrationOptions.find(
  (option) => option.id === "discord"
)!;

function RouteComponent() {
  const posthog = usePostHog();
  const activeOrg = useAtomValue(activeOrganizationAtom);
  const integration = useLiveQuery(
    query.integration.first({ organizationId: activeOrg?.id, type: "discord" })
  );

  const { integrations } = usePlanLimits("discord");

  const parsedConfig: ReturnType<
    typeof discordIntegrationSchema.safeParse
  > | null = (() => {
    if (!integration?.configStr) return null;
    try {
      return discordIntegrationSchema.safeParse(
        JSON.parse(integration.configStr)
      );
    } catch {
      return {
        // TODO: this wont be required once we have a proper JSON type in live-state
        // keep shape compatible with safeParse result
        success: false,
        error: new Error("Invalid JSON in integration.configStr"),
      } as any;
    }
  })();

  const updateIntegration = useCallback(
    (
      config: z.input<typeof discordIntegrationSchema>,
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
          type: "discord",
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

  const handleEnableDiscord = async () => {
    if (integrations.hasReachedLimit) {
      return;
    }

    if (!activeOrg?.id) {
      console.error("[Discord] No active organization selected");
      return;
    }

    await activateDiscord({
      organizationId: activeOrg.id,
      existingIntegrationId: integration?.id,
      existingConfig: parsedConfig?.data ?? undefined,
      posthog,
    });
  };

  if (parsedConfig && !parsedConfig.success) {
    // TODO Handle this better

    console.error(
      "Invalid Discord integration configuration",
      parsedConfig.error
    );

    return (
      <p className="text-center">
        Your Discord integration is not configured correctly.{" "}
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
        {integration?.enabled &&
          (!parsedConfig?.data?.selectedChannels ||
            parsedConfig.data.selectedChannels.length === 0) && (
            <IntegrationWarningCallout title="No support channels configured." subtitle="Add at least one channel for the integration to work." />
          )}
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
                onClick={handleEnableDiscord}
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
                      Send a message in Discord with a link to the same thread
                      in the portal
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
