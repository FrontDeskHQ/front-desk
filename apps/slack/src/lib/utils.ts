import { slackIntegrationSchema } from "@workspace/schemas/integration/slack";
import type z from "zod";

export const safeParseIntegrationSettings = (
  configStr: string | null
): z.infer<typeof slackIntegrationSchema> | undefined => {
  if (!configStr) return undefined;
  try {
    return slackIntegrationSchema.parse(JSON.parse(configStr));
  } catch {
    return undefined;
  }
};

