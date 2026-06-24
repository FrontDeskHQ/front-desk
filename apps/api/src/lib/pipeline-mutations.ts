import type { ServerDB } from "@live-state/sync/server";
import { ulid } from "ulid";
import { z } from "zod";
import { schema } from "../live-state/schema";

export const upsertIdempotencyKeyInputSchema = z.object({
  key: z.string(),
  hash: z.string(),
  id: z.string().optional(),
  createdAt: z.coerce.date().optional(),
});

export const invalidateIdempotencyKeyInputSchema = z.object({
  key: z.string(),
});

export const batchUpsertIdempotencyKeysInputSchema = z.object({
  entries: z.array(
    z.object({
      key: z.string(),
      hash: z.string(),
    }),
  ),
});

export const createPipelineJobInputSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  status: z.string(),
  metadataStr: z.string().nullable().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

export const patchPipelineJobInputSchema = z.object({
  jobId: z.string(),
  status: z.string().optional(),
  metadataPatch: z.record(z.string(), z.unknown()).optional(),
  updatedAt: z.coerce.date().optional(),
});

type IdempotencyDb = Pick<
  ServerDB<typeof schema>,
  "find" | "insert" | "update" | "pipelineIdempotencyKey"
>;
type PipelineJobDb = Pick<
  ServerDB<typeof schema>,
  "insert" | "update" | "pipelineJob"
>;

export const runUpsertIdempotencyKey = async (
  db: IdempotencyDb,
  input: z.infer<typeof upsertIdempotencyKeyInputSchema>,
) => {
  const now = input.createdAt ?? new Date();
  const existing = Object.values(
    await db.find(schema.pipelineIdempotencyKey, {
      where: { key: input.key },
    }),
  )[0];

  if (existing) {
    return db.update(schema.pipelineIdempotencyKey, existing.id, {
      hash: input.hash,
      createdAt: now,
    });
  }

  return db.insert(schema.pipelineIdempotencyKey, {
    id: input.id ?? ulid().toLowerCase(),
    key: input.key,
    hash: input.hash,
    createdAt: now,
  });
};

export const runInvalidateIdempotencyKey = async (
  db: IdempotencyDb,
  input: z.infer<typeof invalidateIdempotencyKeyInputSchema>,
) => {
  const existing = Object.values(
    await db.find(schema.pipelineIdempotencyKey, {
      where: { key: input.key },
    }),
  )[0];

  if (!existing) {
    return { ok: true as const };
  }

  await db.update(schema.pipelineIdempotencyKey, existing.id, {
    hash: "",
    createdAt: new Date(),
  });

  return { ok: true as const };
};

export const runBatchUpsertIdempotencyKeys = async (
  db: IdempotencyDb,
  input: z.infer<typeof batchUpsertIdempotencyKeysInputSchema>,
) => {
  if (input.entries.length === 0) {
    return { ok: true as const };
  }

  const keys = input.entries.map((entry) => entry.key);
  const existingRows = Object.values(
    await db.find(schema.pipelineIdempotencyKey, {
      where: { key: { $in: keys } },
    }),
  );
  const existingByKey = new Map(
    existingRows.map((row) => [row.key, row.id] as const),
  );

  const now = new Date();

  for (const { key, hash } of input.entries) {
    const existingId = existingByKey.get(key);

    if (existingId) {
      await db.update(schema.pipelineIdempotencyKey, existingId, {
        hash,
        createdAt: now,
      });
      continue;
    }

    await db.insert(schema.pipelineIdempotencyKey, {
      id: ulid().toLowerCase(),
      key,
      hash,
      createdAt: now,
    });
  }

  return { ok: true as const };
};

export const runCreatePipelineJob = async (
  db: PipelineJobDb,
  input: z.infer<typeof createPipelineJobInputSchema>,
) => {
  const now = input.createdAt ?? new Date();

  return db.insert(schema.pipelineJob, {
    id: input.id ?? ulid().toLowerCase(),
    name: input.name,
    status: input.status,
    metadataStr: input.metadataStr ?? null,
    createdAt: now,
    updatedAt: input.updatedAt ?? now,
  });
};

export const runPatchPipelineJob = async (
  db: PipelineJobDb,
  input: z.infer<typeof patchPipelineJobInputSchema>,
) => {
  const existing = await db.pipelineJob.one(input.jobId).get();
  if (!existing) {
    throw new Error("PIPELINE_JOB_NOT_FOUND");
  }

  const currentMetadata = existing.metadataStr
    ? (JSON.parse(existing.metadataStr) as Record<string, unknown>)
    : {};
  const metadataStr =
    input.metadataPatch === undefined
      ? existing.metadataStr
      : JSON.stringify({ ...currentMetadata, ...input.metadataPatch });

  return db.pipelineJob.update(existing.id, {
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.metadataPatch !== undefined ? { metadataStr } : {}),
    updatedAt: input.updatedAt ?? new Date(),
  });
};
