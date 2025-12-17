import { githubIntegrationSchema } from "@workspace/schemas/integration/github";
import type z from "zod";

export const safeParseIntegrationSettings = (
  configStr: string | null
): z.infer<typeof githubIntegrationSchema> | undefined => {
  if (!configStr) return undefined;
  try {
    return githubIntegrationSchema.parse(JSON.parse(configStr));
  } catch {
    return undefined;
  }
};
