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
    chunksIndexed: z.number().optional(),
    errorStr: z.string().nullable().optional(),
    id: z.string(),
    lastCrawledAt: z.coerce.date().nullable().optional(),
    organizationId: z.string(),
    pageCount: z.number().optional(),
    status: documentationSourceStatusSchema.optional(),
    updatedAt: z.coerce.date().optional(),
  })
  .refine(
    (input) => {
      const { id: _id, organizationId: _organizationId, ...fields } = input;
      return Object.values(fields).some((value) => value !== undefined);
    },
    { message: "NO_FIELDS_TO_UPDATE" }
  );

type SyncCrawlProgressDb = Pick<ServerDB<typeof schema>, "documentationSource">;

export const runSyncCrawlProgress = async (
  db: SyncCrawlProgressDb,
  input: z.infer<typeof syncCrawlProgressInputSchema>
) => {
  const source = await db.documentationSource
    .first({ id: input.id, organizationId: input.organizationId })
    .get();
  if (!source) {
    throw new Error("DOCUMENTATION_SOURCE_NOT_FOUND");
  }

  if (source.status === "deleted") {
    throw new Error("DOCUMENTATION_SOURCE_DELETED");
  }

  const { id, organizationId: _organizationId, ...updates } = input;

  await db.documentationSource.update(id, {
    ...updates,
    updatedAt: updates.updatedAt ?? new Date(),
  });

  return db.documentationSource.one(id).get();
};
