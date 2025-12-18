import type { Installation, InstallationQuery } from "@slack/oauth";
import { fetchClient, store } from "./live-state";
import { safeParseIntegrationSettings } from "./utils";

export const installationStore = {
  storeInstallation: async (installation: Installation): Promise<void> => {
    // Determine the team/enterprise ID
    const teamId = installation.isEnterpriseInstall
      ? installation.enterprise?.id
      : installation.team?.id;

    if (!teamId) {
      throw new Error("Failed to determine team/enterprise ID from installation");
    }

    // Find the integration by teamId
    const integrations = store.query.integration
      .where({ type: "slack" })
      .get();

    const integration = integrations.find((i) => {
      const parsed = safeParseIntegrationSettings(i.configStr);
      return parsed?.teamId === teamId;
    });

    if (!integration) {
      throw new Error(`Integration not found for teamId: ${teamId}`);
    }

    // Update the integration with the full installation object
    const currentConfig = safeParseIntegrationSettings(integration.configStr) ?? {};
    await fetchClient.mutate.integration.update(integration.id, {
      updatedAt: new Date(),
      configStr: JSON.stringify({
        ...currentConfig,
        teamId,
        installation,
      }),
    });
  },

  fetchInstallation: async (
    installQuery: InstallationQuery<boolean>
  ): Promise<Installation> => {
    const teamId = installQuery.isEnterpriseInstall
      ? installQuery.enterpriseId ?? undefined
      : installQuery.teamId ?? undefined;

    if (!teamId) {
      throw new Error("Failed to determine team/enterprise ID from install query");
    }

    // Find the integration by teamId
    const integrations = store.query.integration
      .where({ type: "slack" })
      .get();

    const integration = integrations.find((i) => {
      const parsed = safeParseIntegrationSettings(i.configStr);
      return parsed?.teamId === teamId;
    });

    if (!integration?.configStr) {
      throw new Error(`Installation not found for teamId: ${teamId}`);
    }

    const parsed = safeParseIntegrationSettings(integration.configStr);

    if (!parsed?.installation) {
      throw new Error(`Installation data not found for teamId: ${teamId}`);
    }

    return parsed.installation as Installation;
  },

  deleteInstallation: async (
    installQuery: InstallationQuery<boolean>
  ): Promise<void> => {
    const teamId = installQuery.isEnterpriseInstall
      ? installQuery.enterpriseId ?? undefined
      : installQuery.teamId ?? undefined;

    if (!teamId) {
      throw new Error("Failed to determine team/enterprise ID from install query");
    }

    // Find the integration by teamId
    const integrations = store.query.integration
      .where({ type: "slack" })
      .get();

    const integration = integrations.find((i) => {
      const parsed = safeParseIntegrationSettings(i.configStr);
      return parsed?.teamId === teamId;
    });

    if (!integration) {
      return; // Already deleted or doesn't exist
    }

    // Remove the installation from the config
    const currentConfig = safeParseIntegrationSettings(integration.configStr) ?? {};
    const { installation, ...configWithoutInstallation } = currentConfig;

    await fetchClient.mutate.integration.update(integration.id, {
      updatedAt: new Date(),
      configStr: JSON.stringify(configWithoutInstallation),
    });
  },
};

