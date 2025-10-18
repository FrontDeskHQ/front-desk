import { createFileRoute, redirect } from "@tanstack/react-router";
import qs from "qs";
import { z } from "zod";
import { fetchClient } from "~/lib/live-state";

const discordCallbackSchema = z.object({
  guild_id: z.string(),
  permissions: z.string(),
  state: z.string(),
});

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/integration/discord/redirect"
)({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const rawQs = qs.parse(request.url.split("?")[1] ?? "", {
          plainObjects: true,
          allowPrototypes: false,
        });
        try {
          const data = discordCallbackSchema.parse(rawQs);

          if (data.guild_id && data.state) {
            const [orgId, csrfToken] = data.state.split("_");

            const integration = (
              await fetchClient.query.integration
                .where({
                  organizationId: orgId,
                  type: "discord",
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

            await fetchClient.mutate.integration.update(integration.id, {
              enabled: true,
              updatedAt: new Date(),
              configStr: JSON.stringify({
                ...config,
                guildId: data.guild_id,
              }),
            });
          }
        } catch (error) {
          console.error("[Discord] Error handling redirect", error);
        }

        throw redirect({
          to: "/app/settings/organization/integration/discord",
        });
      },
    },
  },
});
