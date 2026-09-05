import { z } from "zod";

import { integrationBackfillSchema } from "./shared";

export const discordIntegrationSchema = z.object({
  backfill: integrationBackfillSchema,
  csrfToken: z.string().optional(),
  guildId: z.coerce.string().optional(),
  selectedChannels: z.array(z.string()).optional(),
  syncedChannels: z.array(z.string()).optional(),
});
