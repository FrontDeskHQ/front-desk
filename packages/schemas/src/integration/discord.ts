import { z } from "zod";

export const discordIntegrationSchema = z.object({
  guildId: z.coerce.string().optional(),
  csrfToken: z.string().optional(),
  selectedChannels: z.array(z.string()).optional(),
});
