import { z } from "zod";

export const slackChannelRefSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type SlackChannelRef = z.infer<typeof slackChannelRefSchema>;

export const slackIntegrationSchema = z.object({
  accessToken: z.string().optional(),
  csrfToken: z.string().optional(),
  installation: z.any().optional(),
  selectedChannels: z.array(slackChannelRefSchema).optional(),
  teamId: z.coerce.string().optional(),
});
