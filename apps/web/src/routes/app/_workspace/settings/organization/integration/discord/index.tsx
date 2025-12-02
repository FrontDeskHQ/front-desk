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
import { useAtomValue } from "jotai/react";
import { ArrowLeft } from "lucide-react";
import { useCallback } from "react";
import { ulid } from "ulid";
import type { z } from "zod";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient, mutate, query } from "~/lib/live-state";
import { seo } from "~/utils/seo";
import { integrationOptions } from "..";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/integration/discord/",
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
  (option) => option.id === "discord",
)!;

// Discord bot permissions number - read messages, send messages, and manage webhooks, ...
const DISCORD_BOT_PERMISSIONS = "292594747456";

const generateStateToken = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
};

function RouteComponent() {
  const activeOrg = useAtomValue(activeOrganizationAtom);
  const integration = useLiveQuery(
    query.integration.first({ organizationId: activeOrg?.id, type: "discord" }),
  );

  const parsedConfig: ReturnType<
    typeof discordIntegrationSchema.safeParse
  > | null = (() => {
    if (!integration?.configStr) return null;
    try {
      return discordIntegrationSchema.safeParse(
        JSON.parse(integration.configStr),
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
      config: z.infer<typeof discordIntegrationSchema>,
      enabled: boolean = true,
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
    [integration, activeOrg, parsedConfig?.data],
  );

  const handleEnableDiscord = async () => {
    const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

    if (!DISCORD_CLIENT_ID) {
      console.error("[Discord] Client ID is not configured");
      return;
    }

    if (!activeOrg?.id) {
      console.error("[Discord] No active organization selected");
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
        type: "discord",
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
    const redirectUri = `${baseUrl}/redirect`;

    const queryParams = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      permissions: DISCORD_BOT_PERMISSIONS,
      scope: "identify+bot", // We need identify because we wont get a redirect otherwise
      integration_type: "0", // Add to guild
      redirect_uri: redirectUri,
      state: `${activeOrg?.id}_${csrfToken}`,
      response_type: "code",
    });

    // https://discord.com/developers/docs/topics/oauth2#bot-authorization-flow
    const discordOAuthUrl = `https://discord.com/api/oauth2/authorize?${queryParams.toString().replaceAll("%2B", "+")}`;

    window.location.href = discordOAuthUrl;
  };

  if (parsedConfig && !parsedConfig.success) {
    // TODO Handle this better

    console.error(
      "Invalid Discord integration configuration",
      parsedConfig.error,
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
      <Button variant="ghost" asChild className="absolute top-2 left-1">
        <Link to="/app/settings/organization/integration">
          <ArrowLeft />
          Integrations
        </Link>
      </Button>
      <div className="flex flex-col gap-4 pt-12">
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
              <Button onClick={handleEnableDiscord}>Enable</Button>
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
