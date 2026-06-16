import Elysia from "elysia";
import { z } from "zod";
import { getOctokit } from "../lib/github";
import { fetchClient } from "../lib/live-state";
import { enqueueRepoBackfill } from "../lib/queue";
import { getBaseUrl } from "../utils";

const setupQuerySchema = z.object({
  installation_id: z.coerce.number().positive("Invalid installation_id"),
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

    const installationId = installationIdParam;

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

      // Paginate so installations with >100 repos are fully captured.
      const installationRepos = await octokit.paginate(
        "GET /installation/repositories",
        { per_page: 100 }
      );

      const repos = installationRepos.map((repo) => ({
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

      // Mirror each in-scope repo's full issue/PR history. Idempotent and
      // coalesced per repo, so re-running setup is safe. The integration config
      // is already persisted at this point, so a failed enqueue (e.g. transient
      // Redis outage) must not fail the setup redirect — log and move on.
      const enqueueResults = await Promise.allSettled(
        repos.map((repo) =>
          enqueueRepoBackfill({
            organizationId: orgId,
            installationId,
            owner: repo.owner,
            repo: repo.name,
            fullName: repo.fullName,
          })
        )
      );

      for (const [index, result] of enqueueResults.entries()) {
        if (result.status === "rejected") {
          console.error(
            `[GitHub] Failed to enqueue backfill for ${repos[index]?.fullName}:`,
            result.reason
          );
        }
      }

      set.redirect = `${getBaseUrl()}/app/settings/organization/integration/github`;
    } catch (error) {
      console.error("[GitHub] Error handling installation callback:", error);
      set.redirect = `${getBaseUrl()}/app/settings/organization/integration/github?error=callback_error`;
    }
  }
);
