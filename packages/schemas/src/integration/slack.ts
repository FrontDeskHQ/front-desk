import { z } from "zod";
import { integrationBackfillSchema } from "./shared";

export const slackIntegrationSchema = z.object({
  teamId: z.coerce.string().optional(),
  csrfToken: z.string().optional(),
  selectedChannels: z.array(z.string()).optional(),
  syncedChannels: z.array(z.string()).optional(),
  accessToken: z.string().optional(),
  installation: z.any().optional(),
  showPortalMessage: z.boolean().optional().default(true),
  backfill: integrationBackfillSchema,
});
