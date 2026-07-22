import { z } from "zod";

export const threadFixtureSchema = z.object({
  author: z.string().trim().min(1),
  message: z.string().trim().min(1),
  title: z.string().trim().min(3),
});

export type ThreadFixture = z.infer<typeof threadFixtureSchema>;
