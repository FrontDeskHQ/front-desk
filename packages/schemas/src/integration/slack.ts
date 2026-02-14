import { z } from "zod";

export const slackIntegrationSchema = z.object({
  teamId: z.coerce.string().optional(),
  csrfToken: z.string().optional(),
  selectedChannels: z.array(z.string()).optional(),
  syncedChannels: z.array(z.string()).optional(),
  accessToken: z.string().optional(),
  installation: z.any().optional(),
  showPortalMessage: z.boolean().optional().default(true),
  backfill: z
    .object({
      processed: z.number(),
      total: z.number(),
      limit: z.number().nullable(),
      channelsDiscovering: z.number(),
    })
    .nullable()
    .optional(),
});
