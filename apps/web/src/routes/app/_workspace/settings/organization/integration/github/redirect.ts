import { createFileRoute, redirect } from "@tanstack/react-router";
import qs from "qs";
import { z } from "zod";
import { fetchClient } from "~/lib/live-state";

const githubCallbackSchema = z.object({
  code: z.string(),
  state: z.string(),
});

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/integration/github/redirect",
)({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const rawQs = qs.parse(request.url.split("?")[1] ?? "", {
          plainObjects: true,
          allowPrototypes: false,
        });
        try {
          const data = githubCallbackSchema.parse(rawQs);

          if (data.code && data.state) {
            const [orgId, csrfToken] = data.state.split("_");

            const integration = (
              await fetchClient.query.integration
                .where({
                  organizationId: orgId,
                  type: "github",
                })
                .get()
            )[0];

            if (!integration) {
              throw new Error("INTEGRATION_NOT_FOUND");
            }

            if (!integration.configStr) {
              throw new Error("INTEGRATION_CONFIG_NOT_FOUND");
            }

            const { csrfToken: csrfTokenFromConfig, ...config } = JSON.parse(
              integration.configStr,
            );

            if (csrfTokenFromConfig !== csrfToken) {
              throw new Error("CSRF_TOKEN_MISMATCH");
            }

            // Exchange code for access token via API
            const baseApiUrl =
              import.meta.env.VITE_API_URL || "http://localhost:3333";
            const tokenResponse = await fetch(
              `${baseApiUrl}/api/github/oauth/token`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: data.code }),
              },
            );

            if (!tokenResponse.ok) {
              throw new Error("Failed to exchange GitHub code");
            }

            const { access_token } = await tokenResponse.json();

            // Fetch user's repositories
            const reposResponse = await fetch(
              "https://api.github.com/user/repos?per_page=100&sort=updated",
              {
                headers: {
                  Authorization: `token ${access_token}`,
                  Accept: "application/vnd.github.v3+json",
                },
              },
            );

            if (!reposResponse.ok) {
              throw new Error("Failed to fetch repositories");
            }

            const repos = await reposResponse.json();

            // Store access token temporarily and redirect to repository selection
            await fetchClient.mutate.integration.update(integration.id, {
              configStr: JSON.stringify({
                ...config,
                accessToken: access_token, // Temporary, will be cleared after repo selection
                pendingRepos: repos.map(
                  (repo: {
                    full_name: string;
                    owner: { login: string };
                    name: string;
                  }) => ({
                    fullName: repo.full_name,
                    owner: repo.owner.login,
                    name: repo.name,
                  }),
                ),
              }),
            });

            throw redirect({
              to: "/app/settings/organization/integration/github/select-repo",
            });
          }
        } catch (error) {
          if (error instanceof redirect) throw error;
          console.error("[GitHub] Error handling redirect", error);
        }

        throw redirect({
          to: "/app/settings/organization/integration/github",
        });
      },
    },
  },
});
