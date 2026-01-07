import Elysia from "elysia";
import { z } from "zod";
import { getOctokit } from "../lib/github";
import { fetchClient } from "../lib/live-state";
import { getBaseUrl } from "../utils";

const setupQuerySchema = z.object({
  installation_id: z.string().min(1, "Missing installation_id"),
  setup_action: z.string().optional(),
  state: z.string().min(1, "Missing state"),
});

export const setupRoutes = new Elysia({ prefix: "/api/github" }).get(
  "/setup",
  async ({ query, set }) => {
    const parsed = setupQuerySchema.safeParse(query);

    if (!parsed.success) {
      set.redirect = `${getBaseUrl()}/app/settings/organization/integration/github?error=missing_params`;
      return;
    }

    const { installation_id: installationIdParam, state } = parsed.data;

    const installationId = Number.parseInt(installationIdParam, 10);

    if (Number.isNaN(installationId)) {
      set.redirect = `${getBaseUrl()}/app/settings/organization/integration/github?error=invalid_installation_id`;
      return;
    }

    const [orgId, csrfToken] = state.split("_");

    if (!orgId || !csrfToken) {
      set.redirect = `${getBaseUrl()}/app/settings/organization/integration/github?error=invalid_state`;
      return;
    }

    try {
      const integration = await fetchClient.query.integration
        .first({
          organizationId: orgId,
          type: "github",
        })
        .get();

      if (!integration) {
        throw new Error("INTEGRATION_NOT_FOUND");
      }

      if (!integration.configStr) {
        throw new Error("INTEGRATION_CONFIG_NOT_FOUND");
      }

      const { csrfToken: csrfTokenFromConfig, ...config } = JSON.parse(
        integration.configStr
      );

      if (csrfTokenFromConfig !== csrfToken) {
        throw new Error("CSRF_TOKEN_MISMATCH");
      }

      const octokit = await getOctokit(installationId);

      const { data: reposData } = await octokit.request(
        "GET /installation/repositories",
        {
          per_page: 100,
          headers: {
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );

      const repos = reposData.repositories.map((repo) => ({
        fullName: repo.full_name,
        owner: repo.owner.login,
        name: repo.name,
      }));

      await fetchClient.mutate.integration.update(integration.id, {
        enabled: true,
        updatedAt: new Date(),
        configStr: JSON.stringify({
          ...config,
          installationId,
          repos,
        }),
      });

      set.redirect = `${getBaseUrl()}/app/settings/organization/integration/github`;
    } catch (error) {
      console.error("[GitHub] Error handling installation callback:", error);
      set.redirect = `${getBaseUrl()}/app/settings/organization/integration/github?error=callback_error`;
    }
  }
);
