import type { ServerDB } from "@live-state/sync/server";
import { z } from "zod";
import type { schema } from "../live-state/schema";

const documentationSourceStatusSchema = z.enum([
  "pending",
  "crawling",
  "completed",
  "failed",
  "deleted",
]);

export const syncCrawlProgressInputSchema = z
  .object({
    id: z.string(),
    status: documentationSourceStatusSchema.optional(),
    errorStr: z.string().nullable().optional(),
    pageCount: z.number().optional(),
    chunksIndexed: z.number().optional(),
    lastCrawledAt: z.coerce.date().nullable().optional(),
    updatedAt: z.coerce.date().optional(),
  })
  .refine(
    (input) => {
      const { id: _id, ...fields } = input;
      return Object.values(fields).some((value) => value !== undefined);
    },
    { message: "NO_FIELDS_TO_UPDATE" },
  );

type SyncCrawlProgressDb = Pick<ServerDB<typeof schema>, "documentationSource">;

export const runSyncCrawlProgress = async (
  db: SyncCrawlProgressDb,
  input: z.infer<typeof syncCrawlProgressInputSchema>,
) => {
  const source = await db.documentationSource.one(input.id).get();
  if (!source) {
    throw new Error("DOCUMENTATION_SOURCE_NOT_FOUND");
  }

  const { id, ...updates } = input;

  await db.documentationSource.update(id, {
    ...updates,
    updatedAt: updates.updatedAt ?? new Date(),
  });

  return db.documentationSource.one(id).get();
};
