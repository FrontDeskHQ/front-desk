import { authorize, requireInternalApiKey } from "../../lib/authorize";
import {
  markReplicatedInputSchema,
  recordActivityInputSchema,
  runMarkReplicated,
  runRecordActivity,
} from "../../lib/update-mutations";
import { publicRoute } from "../factories";
import { schema } from "../schema";

export default publicRoute
  .collectionRoute(schema.update, {
    read: () => true,
    insert: () => false,
    update: {
      preMutation: () => false,
      postMutation: () => false,
    },
  })
  .withProcedures(({ mutation }) => ({
    recordActivity: mutation(recordActivityInputSchema).handler(
      async ({ req, db }) => {
        authorize(req, {
          organizationId: req.input.organizationId,
          internalApiKeyOnly: true,
        });

        return runRecordActivity(db, {
          threadId: req.input.threadId,
          organizationId: req.input.organizationId,
          type: req.input.type,
          userId: req.input.userId ?? null,
          userName: req.input.userName ?? null,
          metadata: req.input.metadata,
          replicatedStr: req.input.replicatedStr,
          id: req.input.id,
          createdAt: req.input.createdAt,
        });
      },
    ),
    markReplicated: mutation(markReplicatedInputSchema).handler(
      async ({ req, db }) => {
        requireInternalApiKey(req.context);

        return runMarkReplicated(db, req.input);
      },
    ),
  }));
