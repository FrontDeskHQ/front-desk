import { createHash, timingSafeEqual } from "node:crypto";

import { createServerDB } from "@live-state/sync/server";
import type { Request, Response } from "express";
import { z } from "zod";

import { writeIntegrationCredential } from "../lib/integration-credential";
import { schema } from "../live-state/schema";
import { storage } from "../live-state/storage";

const bodySchema = z.object({
  credential: z.object({
    accessToken: z.string().min(1),
    expiresAt: z.string().datetime(),
    refreshToken: z.string().min(1),
    scope: z.union([z.string(), z.array(z.string())]).refine((scope) => {
      const scopes = Array.isArray(scope) ? scope : scope.split(/[\s,]+/);
      return scopes.includes("read") && scopes.includes("issues:create");
    }),
    tokenType: z.string().min(1),
    viewerId: z.string().min(1),
  }),
  integrationId: z.string().min(1),
  state: z.string().min(1),
  teams: z.array(
    z.object({
      id: z.string().min(1),
      key: z.string().min(1),
      name: z.string().min(1),
    })
  ),
  workspaceId: z.string().min(1),
  workspaceName: z.string().min(1),
});

const secretsMatch = (provided: string, expected: string): boolean => {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
};

export const completeLinearOAuthRoute = async (req: Request, res: Response) => {
  const expectedSecret = process.env.DISCORD_BOT_KEY;
  const providedSecret = req.header("x-discord-bot-key");
  if (
    !(expectedSecret && providedSecret) ||
    !secretsMatch(providedSecret, expectedSecret)
  ) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID_REQUEST" });
    return;
  }

  try {
    const credentialDb = createServerDB(storage, schema);

    const integration = await credentialDb.integration
      .one(parsed.data.integrationId)
      .get();
    if (
      !integration ||
      integration.type !== "linear" ||
      !integration.configStr
    ) {
      res.status(404).json({ error: "INTEGRATION_NOT_FOUND" });
      return;
    }

    let rawConfig: unknown;
    try {
      rawConfig = JSON.parse(integration.configStr);
    } catch {
      res.status(409).json({ error: "INVALID_INTEGRATION_CONFIG" });
      return;
    }
    const config = z.record(z.string(), z.unknown()).safeParse(rawConfig);
    if (!config.success) {
      res.status(409).json({ error: "INVALID_INTEGRATION_CONFIG" });
      return;
    }
    if (config.data.csrfToken !== parsed.data.state) {
      res.status(403).json({ error: "STATE_MISMATCH" });
      return;
    }

    await writeIntegrationCredential(credentialDb, {
      integrationId: integration.id,
      organizationId: integration.organizationId,
      value: parsed.data.credential,
    });
    const { csrfToken: _csrfToken, ...rest } = config.data;
    await storage.update(schema.integration, integration.id, {
      configStr: JSON.stringify({
        ...rest,
        teams: parsed.data.teams,
        workspaceId: parsed.data.workspaceId,
        workspaceName: parsed.data.workspaceName,
      }),
      enabled: true,
      updatedAt: new Date(),
    });
    res.status(204).end();
  } catch (error) {
    console.error("[Linear] OAuth completion failed:", error);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
};
