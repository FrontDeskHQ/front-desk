import { createHmac, timingSafeEqual } from "node:crypto";

import type { LiveStateFetchClient } from "@connectors/framework/runtime";
import { z } from "zod";

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
    removeIssue: (
      integrationId: string,
      organizationId: string,
      issueId: string
    ) => Promise<void>;
    syncIssue: (integrationId: string, issueId: string) => Promise<void>;
  }
): Promise<void> => {
  const event = webhookSchema.parse(JSON.parse(rawBody));
  if (event.type !== "Issue") return;

  const integrations =
    await dependencies.fetchClient.query.integration.listByType({
      type: "linear",
    });
  const matchesWorkspace = (candidate: {
    configStr?: string | null;
    enabled?: boolean;
  }) => {
    if (!(candidate.enabled && candidate.configStr)) return false;
    try {
      return (
        JSON.parse(candidate.configStr).workspaceId === event.organizationId
      );
    } catch {
      return false;
    }
  };
  const matchingIntegrations = integrations.filter(matchesWorkspace);
  if (matchingIntegrations.length === 0) return;

  const issue = z.object({ id: z.string() }).parse(event.data);
  await Promise.all(
    matchingIntegrations.map(async (integration) => {
      const latest = await dependencies.fetchClient.query.integration.byId({
        id: integration.id,
      });
      if (!latest || !matchesWorkspace(latest)) return;
      if (event.action === "remove") {
        await dependencies.removeIssue(
          latest.id,
          latest.organizationId,
          issue.id
        );
        return;
      }
      await dependencies.syncIssue(latest.id, issue.id);
    })
  );
};
