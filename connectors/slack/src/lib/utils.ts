import { createSettingsParser } from "@connectors/framework/runtime";
import { slackIntegrationSchema } from "@workspace/schemas/integration/slack";

export const { safeParseIntegrationSettings } = createSettingsParser(
  slackIntegrationSchema
);
