import { z } from "zod";

export const threadFixtureSchema = z.object({
  title: z.string().min(3),
  author: z.string().min(1),
  message: z.string().min(1),
});

export type ThreadFixture = z.infer<typeof threadFixtureSchema>;

export const threadFixtureFileSchema = z.union([
  threadFixtureSchema,
  z.array(threadFixtureSchema).min(1),
]);

export const normalizeThreadFixtures = (
  input: z.infer<typeof threadFixtureFileSchema>,
): ThreadFixture[] => (Array.isArray(input) ? input : [input]);
