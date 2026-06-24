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
import { requireInternalApiKey } from "../../lib/authorize";
import { publicRoute } from "../factories";
import { schema } from "../schema";

export const pipelineRoutes = {
  pipelineIdempotencyKey: publicRoute
    .collectionRoute(schema.pipelineIdempotencyKey, {
      read: ({ ctx }) => !!ctx?.internalApiKey,
      insert: () => false,
      update: {
        preMutation: () => false,
        postMutation: () => false,
      },
    })
    .withProcedures(({ mutation }) => ({
      upsert: mutation(upsertIdempotencyKeyInputSchema).handler(
        async ({ req, db }) => {
          requireInternalApiKey(req.context);
          return runUpsertIdempotencyKey(db, req.input);
        },
      ),
      invalidate: mutation(invalidateIdempotencyKeyInputSchema).handler(
        async ({ req, db }) => {
          requireInternalApiKey(req.context);
          return runInvalidateIdempotencyKey(db, req.input);
        },
      ),
      batchUpsert: mutation(batchUpsertIdempotencyKeysInputSchema).handler(
        async ({ req, db }) => {
          requireInternalApiKey(req.context);
          return runBatchUpsertIdempotencyKeys(db, req.input);
        },
      ),
    })),
  pipelineJob: publicRoute
    .collectionRoute(schema.pipelineJob, {
      read: ({ ctx }) => !!ctx?.internalApiKey,
      insert: () => false,
      update: {
        preMutation: () => false,
        postMutation: () => false,
      },
    })
    .withProcedures(({ mutation }) => ({
      create: mutation(createPipelineJobInputSchema).handler(
        async ({ req, db }) => {
          requireInternalApiKey(req.context);
          return runCreatePipelineJob(db, req.input);
        },
      ),
      patch: mutation(patchPipelineJobInputSchema).handler(
        async ({ req, db }) => {
          requireInternalApiKey(req.context);
          return runPatchPipelineJob(db, req.input);
        },
      ),
    })),
};
