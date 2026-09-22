import { createHmac, timingSafeEqual } from "node:crypto";

import type { LiveStateFetchClient } from "@connectors/framework/runtime";
import { z } from "zod";

import { linearExternalKey } from "./linear-sync";

const webhookSchema = z.object({
  action: z.string(),
  data: z.unknown(),
  organizationId: z.string(),
  type: z.string(),
});

export const verifyLinearWebhook = (
  rawBody: string,
  signature: string,
  secret: string
): boolean => {
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
};

export const handleLinearWebhook = async (
  rawBody: string,
  dependencies: {
    fetchClient: LiveStateFetchClient;
    syncIssue: (integrationId: string, issueId: string) => Promise<void>;
  }
): Promise<void> => {
  const event = webhookSchema.parse(JSON.parse(rawBody));
  if (event.type !== "Issue") return;

  const integrations =
    await dependencies.fetchClient.query.integration.listByType({
      type: "linear",
    });
  const integration = integrations.find((candidate) => {
    if (!candidate.configStr) return false;
    try {
      return (
        JSON.parse(candidate.configStr).workspaceId === event.organizationId
      );
    } catch {
      return false;
    }
  });
  if (!integration) throw new Error("LINEAR_INTEGRATION_NOT_FOUND");

  const issue = z.object({ id: z.string() }).parse(event.data);
  if (event.action === "remove") {
    await dependencies.fetchClient.mutate.externalEntity.softDelete({
      externalKey: linearExternalKey(issue.id),
      organizationId: integration.organizationId,
    });
    return;
  }
  await dependencies.syncIssue(integration.id, issue.id);
};
