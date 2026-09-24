import { createHmac, timingSafeEqual } from "node:crypto";

import { createQueue, createWorker } from "@connectors/framework/runtime";
import type { LiveStateFetchClient } from "@connectors/framework/runtime";
import { z } from "zod";

const webhookSchema = z.object({
  action: z.string(),
  data: z.unknown(),
  organizationId: z.string(),
  type: z.string(),
  webhookTimestamp: z.number(),
});
const issueWebhookDataSchema = z.object({ id: z.string().min(1) });
const LINEAR_WEBHOOK_MAX_AGE_MS = 60_000;

export type LinearWebhookEvent = z.infer<typeof webhookSchema>;

export interface LinearWebhookDependencies {
  fetchClient: LiveStateFetchClient;
  removeIssue: (
    integrationId: string,
    organizationId: string,
    issueId: string
  ) => Promise<void>;
  syncIssue: (integrationId: string, issueId: string) => Promise<void>;
}

interface LinearWebhookJobData {
  rawBody: string;
}

const LINEAR_WEBHOOK_QUEUE = "linear-webhook";
const LINEAR_WEBHOOK_JOB = "process-webhook";

export const parseLinearWebhook = (rawBody: string): LinearWebhookEvent => {
  const event = webhookSchema.parse(JSON.parse(rawBody));
  if (event.type === "Issue") {
    issueWebhookDataSchema.parse(event.data);
  }
  return event;
};

export const isFreshLinearWebhook = (
  event: LinearWebhookEvent,
  now = Date.now()
): boolean =>
  Math.abs(now - event.webhookTimestamp) <= LINEAR_WEBHOOK_MAX_AGE_MS;

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
  dependencies: LinearWebhookDependencies
): Promise<void> => {
  const event = parseLinearWebhook(rawBody);
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

  const issue = issueWebhookDataSchema.parse(event.data);
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

/**
 * Durable ingress for verified Linear webhook bodies. The HTTP handler only
 * adds the raw signed body; this worker owns all network and mirror work so a
 * slow reconciliation cannot make Linear retry the delivery.
 */
export const createLinearWebhookQueue = (
  dependencies: LinearWebhookDependencies
) => {
  const queue = createQueue<LinearWebhookJobData>(LINEAR_WEBHOOK_QUEUE, {
    defaultJobOptions: {
      attempts: 5,
      backoff: { delay: 5000, type: "exponential" },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { count: 1000 },
    },
  });
  const worker = createWorker<LinearWebhookJobData>(
    LINEAR_WEBHOOK_QUEUE,
    async (job) => {
      await handleLinearWebhook(job.data.rawBody, dependencies);
    },
    { concurrency: 4 }
  );
  worker.on("error", (error) => {
    console.error("[Linear] Webhook worker error:", error);
  });

  return {
    close: async () => {
      await Promise.all([worker.close(), queue.close()]);
    },
    enqueue: async (rawBody: string) => {
      const event = parseLinearWebhook(rawBody);
      if (!isFreshLinearWebhook(event)) return null;
      const job = await queue.add(LINEAR_WEBHOOK_JOB, { rawBody });
      return job.id;
    },
  };
};
