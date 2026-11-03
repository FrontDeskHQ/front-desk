import { z } from "zod";

export const discordIntegrationSchema = z.object({
  csrfToken: z.string().optional(),
  guildId: z.coerce.string().optional(),
  selectedChannels: z.array(z.string()).optional(),
});
