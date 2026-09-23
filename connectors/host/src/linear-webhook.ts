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
  if (!/^[0-9a-f]{64}$/i.test(signature)) {
    return false;
  }
  const received = Buffer.from(signature, "hex");
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
  const matchingIntegrations = integrations.filter((candidate) => {
    if (!(candidate.enabled && candidate.configStr)) return false;
    try {
      return (
        JSON.parse(candidate.configStr).workspaceId === event.organizationId
      );
    } catch {
      return false;
    }
  });
  if (matchingIntegrations.length === 0) return;

  const issue = z.object({ id: z.string() }).parse(event.data);
  if (event.action === "remove") {
    await Promise.all(
      matchingIntegrations.map((integration) =>
        dependencies.fetchClient.mutate.externalEntity.softDelete({
          externalKey: linearExternalKey(issue.id),
          organizationId: integration.organizationId,
        })
      )
    );
    return;
  }
  await Promise.all(
    matchingIntegrations.map((integration) =>
      dependencies.syncIssue(integration.id, issue.id)
    )
  );
};
