import { useLiveQuery } from "@live-state/sync/client";
import { discordIntegrationSchema } from "@workspace/schemas/integration/discord";
import { githubIntegrationSchema } from "@workspace/schemas/integration/github";
import { slackIntegrationSchema } from "@workspace/schemas/integration/slack";
import { useAtomValue } from "jotai/react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { query } from "~/lib/live-state";

export type IntegrationWarning = {
  type: "discord" | "slack" | "github";
  label: string;
  title: string;
  subtitle: string;
  settingsPath: string;
};

export const useIntegrationWarnings = (): IntegrationWarning[] => {
  const activeOrg = useAtomValue(activeOrganizationAtom);

  const integrations = useLiveQuery(
    query.integration.where({
      organizationId: activeOrg?.id,
    }),
  );

  const warnings: IntegrationWarning[] = [];

  if (!integrations) return warnings;

  for (const integration of integrations) {
    if (!integration.enabled || !integration.configStr) continue;

    try {
      const config = JSON.parse(integration.configStr);

      if (integration.type === "discord") {
        const parsed = discordIntegrationSchema.safeParse(config);
        if (
          parsed.success &&
          (!parsed.data.selectedChannels ||
            parsed.data.selectedChannels.length === 0)
        ) {
          warnings.push({
            type: "discord",
            label: "Discord",
            title: "No support channels configured.",
            subtitle:
              "Add at least one channel for the integration to work.",
            settingsPath:
              "/app/settings/organization/integration/discord",
          });
        }
      }

      if (integration.type === "slack") {
        const parsed = slackIntegrationSchema.safeParse(config);
        if (
          parsed.success &&
          (!parsed.data.selectedChannels ||
            parsed.data.selectedChannels.length === 0)
        ) {
          warnings.push({
            type: "slack",
            label: "Slack",
            title: "No support channels configured.",
            subtitle:
              "Add at least one channel for the integration to work.",
            settingsPath:
              "/app/settings/organization/integration/slack",
          });
        }
      }

      if (integration.type === "github") {
        const parsed = githubIntegrationSchema.safeParse(config);
        if (
          parsed.success &&
          (!parsed.data.repos || parsed.data.repos.length === 0)
        ) {
          warnings.push({
            type: "github",
            label: "GitHub",
            title: "No repositories connected.",
            subtitle:
              "Connect at least one repository for the integration to work.",
            settingsPath:
              "/app/settings/organization/integration/github",
          });
        }
      }
    } catch {
      // Invalid JSON in configStr, skip
    }
  }

  return warnings;
};
