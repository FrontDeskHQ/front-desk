import type { ServerDB } from "@live-state/sync/server";
import { ulid } from "ulid";
import { z } from "zod";
import { schema } from "../live-state/schema";

const replicatedStrSchema = z
  .string()
  .refine(
    (value) => {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "INVALID_REPLICATED_STR" },
  );

export const recordActivityInputSchema = z.object({
  threadId: z.string(),
  organizationId: z.string(),
  type: z.string().min(1),
  userId: z.string().nullable().optional(),
  userName: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  replicatedStr: replicatedStrSchema.nullable().optional(),
  id: z.string().optional(),
  createdAt: z.coerce.date().optional(),
});

export const markReplicatedInputSchema = z.object({
  updateId: z.string(),
  replicatedStr: replicatedStrSchema,
});

type RecordActivityDb = Pick<ServerDB<typeof schema>, "thread" | "insert">;
type MarkReplicatedDb = Pick<ServerDB<typeof schema>, "update">;

export const runMarkReplicated = async (
  db: MarkReplicatedDb,
  input: z.infer<typeof markReplicatedInputSchema>,
) => {
  const update = await db.update.one(input.updateId).get();
  if (!update) {
    throw new Error("UPDATE_NOT_FOUND");
  }

  await db.update.update(input.updateId, {
    replicatedStr: input.replicatedStr,
  });

  return {
    ...update,
    replicatedStr: input.replicatedStr,
  };
};

export const runRecordActivity = async (
  db: RecordActivityDb,
  input: z.infer<typeof recordActivityInputSchema>,
) => {
  const thread = await db.thread.one(input.threadId).get();
  if (!thread || thread.organizationId !== input.organizationId) {
    throw new Error("THREAD_NOT_FOUND");
  }

  const metadata: Record<string, unknown> = {
    ...(input.metadata ?? {}),
    userName: input.userName ?? null,
  };

  const replicatedStr =
    input.replicatedStr === undefined
      ? JSON.stringify({})
      : input.replicatedStr;

  return db.insert(schema.update, {
    id: input.id ?? ulid().toLowerCase(),
    threadId: input.threadId,
    userId: input.userId ?? null,
    type: input.type,
    createdAt: input.createdAt ?? new Date(),
    metadataStr: JSON.stringify(metadata),
    replicatedStr,
  });
};
