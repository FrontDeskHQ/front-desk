import { slackIntegrationSchema } from "@workspace/schemas/integration/slack";
import type z from "zod";
import { fetchClient } from "./live-state";

export const updateBackfillStatus = async (
  integrationId: string,
  configStr: string | null,
  backfill: { processed: number; total: number } | null,
) => {
  const current = safeParseIntegrationSettings(configStr);
  await fetchClient.mutate.integration.update(integrationId, {
    configStr: JSON.stringify({ ...current, backfill }),
  });
};

export const safeParseIntegrationSettings = (
  configStr: string | null,
): z.infer<typeof slackIntegrationSchema> | undefined => {
  if (!configStr) return undefined;
  try {
    return slackIntegrationSchema.parse(JSON.parse(configStr));
  } catch {
    return undefined;
  }
};
