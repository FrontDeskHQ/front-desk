import type { ServerDB } from "@live-state/sync/server";
import { ulid } from "ulid";
import { z } from "zod";

import { schema } from "../live-state/schema";

const jsonObjectStringSchema = z.string().refine(
  (value) => {
    try {
      const parsed = JSON.parse(value);
      return (
        parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      );
    } catch {
      return false;
    }
  },
  { message: "metadataStr must be a JSON object string" }
);

const parseMetadataStr = (metadataStr: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(metadataStr);
    return parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

export const upsertIdempotencyKeyInputSchema = z.object({
  createdAt: z.coerce.date().optional(),
  hash: z.string(),
  id: z.string().optional(),
  key: z.string(),
});

export const invalidateIdempotencyKeyInputSchema = z.object({
  key: z.string(),
});

export const batchUpsertIdempotencyKeysInputSchema = z.object({
  entries: z.array(
    z.object({
      hash: z.string(),
      key: z.string(),
    })
  ),
});

export const createPipelineJobInputSchema = z.object({
  createdAt: z.coerce.date().optional(),
  id: z.string().optional(),
  metadataStr: jsonObjectStringSchema.nullable().optional(),
  name: z.string(),
  status: z.string(),
  updatedAt: z.coerce.date().optional(),
});

export const patchPipelineJobInputSchema = z.object({
  jobId: z.string(),
  metadataPatch: z.record(z.string(), z.unknown()).optional(),
  status: z.string().optional(),
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
  input: z.infer<typeof upsertIdempotencyKeyInputSchema>
) => {
  const now = input.createdAt ?? new Date();
  const existing = Object.values(
    await db.find(schema.pipelineIdempotencyKey, {
      where: { key: input.key },
    })
  )[0];

  if (existing) {
    return db.update(schema.pipelineIdempotencyKey, existing.id, {
      createdAt: now,
      hash: input.hash,
    });
  }

  try {
    return await db.insert(schema.pipelineIdempotencyKey, {
      createdAt: now,
      hash: input.hash,
      id: input.id ?? ulid().toLowerCase(),
      key: input.key,
    });
  } catch {
    const concurrent = Object.values(
      await db.find(schema.pipelineIdempotencyKey, {
        where: { key: input.key },
      })
    )[0];

    if (!concurrent) {
      throw new Error("PIPELINE_IDEMPOTENCY_KEY_UPSERT_FAILED");
    }

    return db.update(schema.pipelineIdempotencyKey, concurrent.id, {
      createdAt: now,
      hash: input.hash,
    });
  }
};

export const runInvalidateIdempotencyKey = async (
  db: IdempotencyDb,
  input: z.infer<typeof invalidateIdempotencyKeyInputSchema>
) => {
  const existing = Object.values(
    await db.find(schema.pipelineIdempotencyKey, {
      where: { key: input.key },
    })
  )[0];

  if (!existing) {
    return { ok: true as const };
  }

  await db.update(schema.pipelineIdempotencyKey, existing.id, {
    createdAt: new Date(),
    hash: "",
  });

  return { ok: true as const };
};

export const runBatchUpsertIdempotencyKeys = async (
  db: IdempotencyDb,
  input: z.infer<typeof batchUpsertIdempotencyKeysInputSchema>
) => {
  if (input.entries.length === 0) {
    return { ok: true as const };
  }

  const entriesByKey = new Map(
    input.entries.map((entry) => [entry.key, entry] as const)
  );
  const entries = [...entriesByKey.values()];
  const keys = entries.map((entry) => entry.key);
  const existingRows = Object.values(
    await db.find(schema.pipelineIdempotencyKey, {
      where: { key: { $in: keys } },
    })
  );
  const existingByKey = new Map(
    existingRows.map((row) => [row.key, row.id] as const)
  );

  const now = new Date();

  for (const { key, hash } of entries) {
    const existingId = existingByKey.get(key);

    if (existingId) {
      await db.update(schema.pipelineIdempotencyKey, existingId, {
        createdAt: now,
        hash,
      });
      continue;
    }

    const created = await db.insert(schema.pipelineIdempotencyKey, {
      createdAt: now,
      hash,
      id: ulid().toLowerCase(),
      key,
    });
    existingByKey.set(key, created.id);
  }

  return { ok: true as const };
};

export const runCreatePipelineJob = async (
  db: PipelineJobDb,
  input: z.infer<typeof createPipelineJobInputSchema>
) => {
  const now = input.createdAt ?? new Date();

  return db.insert(schema.pipelineJob, {
    createdAt: now,
    id: input.id ?? ulid().toLowerCase(),
    metadataStr: input.metadataStr ?? null,
    name: input.name,
    status: input.status,
    updatedAt: input.updatedAt ?? now,
  });
};

export const runPatchPipelineJob = async (
  db: PipelineJobDb,
  input: z.infer<typeof patchPipelineJobInputSchema>
) => {
  const existing = await db.pipelineJob.one(input.jobId).get();
  if (!existing) {
    throw new Error("PIPELINE_JOB_NOT_FOUND");
  }

  const currentMetadata = existing.metadataStr
    ? parseMetadataStr(existing.metadataStr)
    : {};
  const metadataStr =
    input.metadataPatch === undefined
      ? existing.metadataStr
      : JSON.stringify({ ...currentMetadata, ...input.metadataPatch });

  return db.pipelineJob.update(existing.id, {
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.metadataPatch === undefined ? {} : { metadataStr }),
    updatedAt: input.updatedAt ?? new Date(),
  });
};
