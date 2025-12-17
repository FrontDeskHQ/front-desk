import { createFileRoute, redirect } from "@tanstack/react-router";
import qs from "qs";
import { z } from "zod";
import { fetchClient } from "~/lib/live-state";

const slackCallbackSchema = z.object({
  code: z.string(),
  state: z.string(),
});

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/integration/slack/redirect"
)({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const rawQs = qs.parse(request.url.split("?")[1] ?? "", {
          plainObjects: true,
          allowPrototypes: false,
        });
        try {
          const data = slackCallbackSchema.parse(rawQs);

          if (data.code && data.state) {
            const [orgId, csrfToken] = data.state.split("_");

            const integration = (
              await fetchClient.query.integration
                .where({
                  organizationId: orgId,
                  type: "slack",
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
              integration.configStr
            );

            if (csrfTokenFromConfig !== csrfToken) {
              throw new Error("CSRF_TOKEN_MISMATCH");
            }

            const SLACK_CLIENT_ID = import.meta.env.VITE_SLACK_CLIENT_ID;
            const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;

            if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
              throw new Error("SLACK_CREDENTIALS_NOT_CONFIGURED");
            }

            const requestUrl = new URL(request.url);
            const baseUrl = `${requestUrl.protocol}//${requestUrl.host}${requestUrl.pathname.split("/redirect")[0]}`;
            const redirectUri = `${import.meta.env.DEV ? "https://redirectmeto.com/" : ""}${baseUrl}/redirect`;

            const tokenResponse = await fetch(
              "https://slack.com/api/oauth.v2.access",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  client_id: SLACK_CLIENT_ID,
                  client_secret: SLACK_CLIENT_SECRET,
                  code: data.code,
                  redirect_uri: redirectUri,
                }),
              }
            );

            const tokenData = await tokenResponse.json();

            if (!tokenData.ok) {
              throw new Error(
                `SLACK_TOKEN_EXCHANGE_FAILED: ${tokenData.error}`
              );
            }

            const teamId = tokenData.team?.id;

            if (!teamId) {
              throw new Error("SLACK_TEAM_ID_NOT_FOUND");
            }

            await fetchClient.mutate.integration.update(integration.id, {
              enabled: true,
              updatedAt: new Date(),
              configStr: JSON.stringify({
                ...config,
                teamId,
                accessToken: tokenData.access_token,
              }),
            });
          }
        } catch (error) {
          console.error("[Slack] Error handling redirect", error);
        }

        throw redirect({
          to: "/app/settings/organization/integration/slack",
        });
      },
    },
  },
});
