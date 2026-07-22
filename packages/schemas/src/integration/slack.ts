import { z } from "zod";

import { integrationBackfillSchema } from "./shared";

export const slackChannelRefSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type SlackChannelRef = z.infer<typeof slackChannelRefSchema>;

export const slackIntegrationSchema = z.object({
  accessToken: z.string().optional(),
  backfill: integrationBackfillSchema,
  csrfToken: z.string().optional(),
  installation: z.any().optional(),
  selectedChannels: z.array(slackChannelRefSchema).optional(),
  showPortalMessage: z.boolean().optional().default(true),
  syncedChannels: z.array(z.string()).optional(),
  teamId: z.coerce.string().optional(),
});
