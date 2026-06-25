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

const requireInternalApiKey = (internalApiKey: string | undefined) => {
  if (!internalApiKey) {
    throw new Error("UNAUTHORIZED");
  }
};

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
          requireInternalApiKey(req.context?.internalApiKey);
          return runUpsertIdempotencyKey(db, req.input);
        },
      ),
      invalidate: mutation(invalidateIdempotencyKeyInputSchema).handler(
        async ({ req, db }) => {
          requireInternalApiKey(req.context?.internalApiKey);
          return runInvalidateIdempotencyKey(db, req.input);
        },
      ),
      batchUpsert: mutation(batchUpsertIdempotencyKeysInputSchema).handler(
        async ({ req, db }) => {
          requireInternalApiKey(req.context?.internalApiKey);
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
          requireInternalApiKey(req.context?.internalApiKey);
          return runCreatePipelineJob(db, req.input);
        },
      ),
      patch: mutation(patchPipelineJobInputSchema).handler(
        async ({ req, db }) => {
          requireInternalApiKey(req.context?.internalApiKey);
          return runPatchPipelineJob(db, req.input);
        },
      ),
    })),
};
