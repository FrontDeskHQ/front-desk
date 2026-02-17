import { z } from "zod";

export const integrationBackfillSchema = z
  .object({
    processed: z.number(),
    total: z.number(),
    limit: z.number().nullable().default(null),
    channelsDiscovering: z.number().default(0),
  })
  .nullable()
  .optional();
