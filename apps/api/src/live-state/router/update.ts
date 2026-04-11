import { z } from "zod";
import { authorize } from "../../lib/authorize";
import { publicRoute } from "../factories";
import { schema } from "../schema";

export default publicRoute.collectionRoute(schema.update, {
  read: () => true,
  insert: ({ ctx }) => !!ctx?.internalApiKey,
  update: {
    preMutation: ({ ctx }) => !!ctx?.internalApiKey,
    postMutation: ({ ctx }) => !!ctx?.internalApiKey,
  },
}).withProcedures(({ mutation }) => ({
  create: mutation(
    z.object({
      id: z.string(),
      threadId: z.string(),
      userId: z.string().nullable(),
      type: z.string(),
      createdAt: z.coerce.date(),
      metadataStr: z.string().nullable(),
      replicatedStr: z.string().nullable(),
    }),
  ).handler(async ({ req, db }) => {
    const thread = await db.thread.one(req.input.threadId).get();

    if (!thread) {
      throw new Error("THREAD_NOT_FOUND");
    }

    authorize(req.context, {
      organizationId: thread.organizationId,
      allowPublicApiKey: true,
    });

    await db.insert(schema.update, req.input);

    return req.input;
  }),
}));
