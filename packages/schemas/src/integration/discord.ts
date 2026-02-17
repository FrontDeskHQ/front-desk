import { z } from "zod";
import { integrationBackfillSchema } from "./shared";

export const discordIntegrationSchema = z.object({
  guildId: z.coerce.string().optional(),
  csrfToken: z.string().optional(),
  selectedChannels: z.array(z.string()).optional(),
  syncedChannels: z.array(z.string()).optional(),
  showPortalMessage: z.boolean().optional().default(true),
  backfill: integrationBackfillSchema,
});
