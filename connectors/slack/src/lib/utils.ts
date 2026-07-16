import {
  createBackfillHelpers,
  createSettingsParser,
} from "@connectors/framework/runtime";
import { slackIntegrationSchema } from "@workspace/schemas/integration/slack";
import { fetchClient } from "./live-state";

export const { safeParseIntegrationSettings } = createSettingsParser(
  slackIntegrationSchema,
);

export const {
  withBackfillLock,
  updateBackfillStatus,
  updateSyncedChannels,
  getBackfillLimit,
} = createBackfillHelpers(fetchClient);
