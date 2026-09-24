import { createHash, timingSafeEqual } from "node:crypto";

import type { Request, Response } from "express";
import { z } from "zod";

import {
  lockOwnedIntegration,
  writeIntegrationCredentialInTransaction,
} from "../lib/integration-credential";
import { integrationCredentialStorage } from "../lib/integration-credential-storage";

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

const stateMatches = (provided: string, expectedHash: string): boolean =>
  secretsMatch(
    createHash("sha256").update(provided).digest("hex"),
    expectedHash
  );

export const completeLinearOAuthRoute = async (req: Request, res: Response) => {
  const expectedSecret = process.env.CONNECTOR_HOST_SECRET;
  const providedSecret = req.header("x-connector-host-key");
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
    const credentialDb = integrationCredentialStorage;
    const outcome = await credentialDb.transaction(async ({ trx }) => {
      const initialIntegration = await trx.integration
        .one(parsed.data.integrationId)
        .get();
      if (!initialIntegration || initialIntegration.type !== "linear") {
        return { error: "INTEGRATION_NOT_FOUND" as const, status: 404 };
      }

      await lockOwnedIntegration(
        trx,
        initialIntegration.organizationId,
        initialIntegration.id
      );
      const integration = await trx.integration
        .one(initialIntegration.id)
        .get();
      if (!integration || integration.type !== "linear") {
        return { error: "INTEGRATION_NOT_FOUND" as const, status: 404 };
      }
      const pendingState = (
        await trx.integrationOAuthState
          .where({ integrationId: integration.id })
          .get()
      )[0];
      if (
        !pendingState ||
        pendingState.consumedAt ||
        pendingState.expiresAt.getTime() <= Date.now() ||
        !stateMatches(parsed.data.state, pendingState.stateHash)
      ) {
        return { error: "STATE_MISMATCH" as const, status: 403 };
      }

      let rawConfig: unknown;
      try {
        rawConfig = JSON.parse(integration.configStr ?? "{}");
      } catch {
        return {
          error: "INVALID_INTEGRATION_CONFIG" as const,
          status: 409,
        };
      }
      const config = z.record(z.string(), z.unknown()).safeParse(rawConfig);
      if (!config.success) {
        return {
          error: "INVALID_INTEGRATION_CONFIG" as const,
          status: 409,
        };
      }

      await writeIntegrationCredentialInTransaction(trx, {
        integrationId: integration.id,
        organizationId: integration.organizationId,
        value: parsed.data.credential,
      });
      const { defaultTeamId, ...rest } = config.data;
      const selectedTeam = parsed.data.teams.some(
        (team) => team.id === defaultTeamId
      )
        ? { defaultTeamId }
        : {};
      const now = new Date();
      await trx.integration.update(integration.id, {
        configStr: JSON.stringify({
          ...rest,
          ...selectedTeam,
          teams: parsed.data.teams,
          workspaceId: parsed.data.workspaceId,
          workspaceName: parsed.data.workspaceName,
        }),
        enabled: true,
        updatedAt: now,
      });
      await trx.integrationOAuthState.update(pendingState.id, {
        consumedAt: now,
      });
      return null;
    });
    if (outcome) {
      res.status(outcome.status).json({ error: outcome.error });
      return;
    }
    res.status(204).end();
  } catch (error) {
    console.error("[Linear] OAuth completion failed:", error);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
};
