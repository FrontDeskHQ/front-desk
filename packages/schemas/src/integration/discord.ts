import { z } from "zod";

export const discordIntegrationSchema = z.object({
  guildId: z.coerce.string().optional(),
  csrfToken: z.string().optional(),
  selectedChannels: z.array(z.string()).optional(),
  showPortalMessage: z.boolean().optional().default(true),
  backfill: z
    .object({ processed: z.number(), total: z.number() })
    .nullable()
    .optional(),
});
