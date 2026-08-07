import { customerChannelSchema } from "@workspace/schemas/customer-channel";
import type { CustomerChannel } from "@workspace/schemas/customer-channel";
import { z } from "zod";

export const threadFixtureSchema = z.object({
  author: z.string().trim().min(1),
  channel: customerChannelSchema.default("portal"),
  message: z.string().trim().min(1),
  title: z.string().trim().min(3),
});

export type ThreadFixture = z.infer<typeof threadFixtureSchema>;
export type { CustomerChannel };
