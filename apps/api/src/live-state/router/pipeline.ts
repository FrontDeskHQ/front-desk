import { z } from "zod";

import { requireInternalApiKey } from "../../lib/authorize";
import {
  batchUpsertIdempotencyKeysInputSchema,
  createPipelineJobInputSchema,
  invalidateIdempotencyKeyInputSchema,
  patchPipelineJobInputSchema,
  runBatchUpsertIdempotencyKeys,
  runCreatePipelineJob,
  runInvalidateIdempotencyKey,
  runPatchPipelineJob,
  runUpsertIdempotencyKey,
  upsertIdempotencyKeyInputSchema,
} from "../../lib/pipeline-mutations";
import { publicRoute } from "../factories";
import { schema } from "../schema";

export const pipelineRoutes = {
  pipelineIdempotencyKey: publicRoute.withProcedures(({ mutation, query }) => ({
    batchUpsert: mutation(batchUpsertIdempotencyKeysInputSchema).handler(
      async ({ req, db }) => {
        requireInternalApiKey(req.context);
        return runBatchUpsertIdempotencyKeys(db, req.input);
      }
    ),
    /** Idempotency keys by key value (batch) — worker internal only. */
    byKeys: query(z.object({ keys: z.array(z.string()) })).handler(
      async ({ req, db }) => {
        requireInternalApiKey(req.context);
        if (req.input.keys.length === 0) return [];
        return Object.values(
          await db.find(schema.pipelineIdempotencyKey, {
            where: { key: { $in: req.input.keys } },
          })
        );
      }
    ),
    invalidate: mutation(invalidateIdempotencyKeyInputSchema).handler(
      async ({ req, db }) => {
        requireInternalApiKey(req.context);
        return runInvalidateIdempotencyKey(db, req.input);
      }
    ),
    upsert: mutation(upsertIdempotencyKeyInputSchema).handler(
      async ({ req, db }) => {
        requireInternalApiKey(req.context);
        return runUpsertIdempotencyKey(db, req.input);
      }
    ),
  })),
  pipelineJob: publicRoute.withProcedures(({ mutation, query }) => ({
    /** Single pipeline job by id — worker internal only. */
    byId: query(z.object({ id: z.string() })).handler(async ({ req, db }) => {
      requireInternalApiKey(req.context);
      return Object.values(
        await db.find(schema.pipelineJob, { where: { id: req.input.id } })
      )[0];
    }),
    create: mutation(createPipelineJobInputSchema).handler(
      async ({ req, db }) => {
        requireInternalApiKey(req.context);
        return runCreatePipelineJob(db, req.input);
      }
    ),
    patch: mutation(patchPipelineJobInputSchema).handler(
      async ({ req, db }) => {
        requireInternalApiKey(req.context);
        return runPatchPipelineJob(db, req.input);
      }
    ),
  })),
};
