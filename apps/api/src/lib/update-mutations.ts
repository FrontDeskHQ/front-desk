import type { ServerDB } from "@live-state/sync/server";
import { ulid } from "ulid";
import { z } from "zod";
import { schema } from "../live-state/schema";

export const recordActivityInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  type: z.string().min(1),
  userId: z.string().nullable().optional(),
  userName: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  replicatedStr: z.string().nullable().optional(),
  id: z.string().optional(),
  createdAt: z.coerce.date().optional(),
});

type RecordActivityDb = Pick<ServerDB<typeof schema>, "thread" | "insert">;

export const runRecordActivity = async (
  db: RecordActivityDb,
  input: z.infer<typeof recordActivityInputSchema>,
) => {
  const thread = await db.thread.one(input.threadId).get();
  if (!thread || thread.organizationId !== input.organizationId) {
    throw new Error("THREAD_NOT_FOUND");
  }

  const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };
  if (input.userName) {
    metadata.userName = input.userName;
  }

  return db.insert(schema.update, {
    id: input.id ?? ulid().toLowerCase(),
    threadId: input.threadId,
    userId: input.userId ?? null,
    type: input.type,
    createdAt: input.createdAt ?? new Date(),
    metadataStr: JSON.stringify(metadata),
    replicatedStr:
      input.replicatedStr === undefined
        ? JSON.stringify({})
        : input.replicatedStr,
  });
};
