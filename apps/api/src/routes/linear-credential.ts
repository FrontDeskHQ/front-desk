import { createHash, timingSafeEqual } from "node:crypto";

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";

import {
  readIntegrationCredential,
  writeIntegrationCredential,
} from "../lib/integration-credential";
import { integrationCredentialStorage } from "../lib/integration-credential-storage";

export const linearCredentialSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.string().datetime(),
  refreshToken: z.string().min(1),
  scope: z.union([z.string(), z.array(z.string())]),
  tokenType: z.string().min(1),
  viewerId: z.string().min(1),
});

const bodySchema = z.discriminatedUnion("operation", [
  z.object({ integrationId: z.string().min(1), operation: z.literal("read") }),
  z.object({
    credential: linearCredentialSchema,
    integrationId: z.string().min(1),
    operation: z.literal("write"),
  }),
]);

const secretsMatch = (provided: string, expected: string): boolean => {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
};

const fulfillLinearCredentialRoute = async (req: Request, res: Response) => {
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

  const integration = await integrationCredentialStorage.integration
    .one(parsed.data.integrationId)
    .get();
  if (!integration || integration.type !== "linear") {
    res.status(404).json({ error: "INTEGRATION_NOT_FOUND" });
    return;
  }

  const scope = {
    integrationId: integration.id,
    organizationId: integration.organizationId,
  };
  if (parsed.data.operation === "write") {
    await writeIntegrationCredential(integrationCredentialStorage, {
      ...scope,
      value: parsed.data.credential,
    });
    res.status(204).end();
    return;
  }

  const credential = await readIntegrationCredential(
    integrationCredentialStorage,
    scope
  );
  if (!credential) {
    res.status(404).json({ error: "CREDENTIAL_NOT_FOUND" });
    return;
  }
  res.json({ credential, organizationId: integration.organizationId });
};

const handleLinearCredentialRoute = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await fulfillLinearCredentialRoute(req, res);
  } catch (error) {
    next(error);
  }
};

export const linearCredentialRoute: RequestHandler = (req, res, next) => {
  void handleLinearCredentialRoute(req, res, next);
};
