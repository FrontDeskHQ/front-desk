import { z } from "zod";

export const slackIntegrationSchema = z.object({
  teamId: z.coerce.string().optional(),
  csrfToken: z.string().optional(),
  selectedChannels: z.array(z.string()).optional(),
});
