import { discordIntegrationSchema } from "@workspace/schemas/integration/discord";
import type z from "zod";

export const safeParseIntegrationSettings = (
  configStr: string | null
): z.infer<typeof discordIntegrationSchema> | undefined => {
  if (!configStr) return undefined;
  try {
    return discordIntegrationSchema.parse(JSON.parse(configStr));
  } catch {
    return undefined;
  }
};
