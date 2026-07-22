import { z } from "zod";

export const integrationBackfillSchema = z
  .object({
    channelsDiscovering: z.number().default(0),
    limit: z.number().nullable().default(null),
    processed: z.number(),
    total: z.number(),
  })
  .nullable()
  .optional();
