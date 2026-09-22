import { linearIntegrationSchema } from "@workspace/schemas/integration/linear";

import type { HostedConnector } from "./host";

export const linearConnector: HostedConnector = {
  async invoke({ capability, config, method }) {
    if (capability === "issue-tracker" && method === "listTargets") {
      if (!config) return { body: { error: "MISSING_CONFIG" }, status: 400 };
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(config);
      } catch {
        return { body: { error: "INVALID_CONFIG" }, status: 400 };
      }
      const parsed = linearIntegrationSchema.safeParse(parsedJson);
      if (!parsed.success) {
        return { body: { error: "INVALID_CONFIG" }, status: 400 };
      }
      return {
        body: {
          targets: parsed.data.teams.map((team) => ({
            label: `${team.key} — ${team.name}`,
            target: { teamId: team.id },
          })),
        },
        status: 200,
      };
    }
    return { body: { error: "METHOD_NOT_IMPLEMENTED" }, status: 501 };
  },
  async probe() {
    return { live: false };
  },
  type: "linear",
};
