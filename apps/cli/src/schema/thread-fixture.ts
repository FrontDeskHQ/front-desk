import { z } from "zod";

export const threadFixtureSchema = z.object({
  title: z.string().trim().min(3),
  author: z.string().trim().min(1),
  message: z.string().trim().min(1),
});

export type ThreadFixture = z.infer<typeof threadFixtureSchema>;
