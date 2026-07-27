import {
  CONNECTION_PROBE_PATH,
  CONNECTION_PROBE_SECRET_HEADER,
  probeRequestSchema,
} from "@connectors/framework";
import Elysia from "elysia";

import { app } from "../lib/github";
import { sanitizeGithubInstallConfig } from "../utils";

/**
 * External-install liveness probe (ADR-0010). Not a Capability — orthogonal to
 * issue-tracker / pr-tracker. Checks whether the stored GitHub App installation
 * still exists; on dead, returns a sanitized `configStr` suggestion.
 */
export const connectionProbeRoutes = new Elysia().post(
  CONNECTION_PROBE_PATH,
  async ({ body: requestBody, headers, set }) => {
    const expectedSecret = process.env.DISCORD_BOT_KEY;
    if (
      !expectedSecret ||
      headers[CONNECTION_PROBE_SECRET_HEADER] !== expectedSecret
    ) {
      set.status = 401;
      return { error: "UNAUTHORIZED" };
    }

    const parsed = probeRequestSchema.safeParse(requestBody);
    if (!parsed.success) {
      set.status = 400;
      return {
        error: parsed.error.issues[0]?.message ?? "Invalid probe request",
      };
    }

    const { config } = parsed.data;

    if (!config) {
      return { live: false };
    }

    let raw: unknown;
    try {
      raw = JSON.parse(config);
    } catch {
      set.status = 400;
      return { error: "INVALID_CONFIG" };
    }

    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      set.status = 400;
      return { error: "INVALID_CONFIG" };
    }

    const configObj = raw as Record<string, unknown>;
    const installationId = Number(configObj.installationId);
    const sanitizedConfigStr = () =>
      JSON.stringify(sanitizeGithubInstallConfig(configObj));

    if (!Number.isInteger(installationId) || installationId <= 0) {
      return { configStr: sanitizedConfigStr(), live: false };
    }

    try {
      await app.octokit.request("GET /app/installations/{installation_id}", {
        installation_id: installationId,
      });
      return { live: true };
    } catch (error) {
      const status =
        error && typeof error === "object" && "status" in error
          ? Number((error as { status: unknown }).status)
          : undefined;

      // Installation gone (uninstalled) or never existed.
      if (status === 404) {
        return { configStr: sanitizedConfigStr(), live: false };
      }

      console.error("[GitHub] Connection probe failed:", error);
      set.status = 500;
      return { error: "PROBE_FAILED" };
    }
  }
);
