import { authorize } from "../../lib/authorize";
import {
  recordActivityInputSchema,
  runRecordActivity,
} from "../../lib/update-mutations";
import { publicRoute } from "../factories";
import { schema } from "../schema";

export default publicRoute
  .collectionRoute(schema.update, {
    read: () => true,
    insert: ({ ctx }) => {
      if (ctx?.internalApiKey) return true;
      if (!ctx?.session) return false;

      return {
        thread: {
          organization: {
            organizationUsers: {
              userId: ctx.session.userId,
              enabled: true,
            },
          },
        },
      };
    },
    update: {
      preMutation: ({ ctx }) => {
        if (ctx?.internalApiKey) return true;
        if (!ctx?.session) return false;

        return {
          thread: {
            organization: {
              organizationUsers: {
                userId: ctx.session.userId,
                enabled: true,
              },
            },
          },
        };
      },
      postMutation: ({ ctx }) => {
        if (ctx?.internalApiKey) return true;
        if (!ctx?.session) return false;

        return {
          thread: {
            organization: {
              organizationUsers: {
                userId: ctx.session.userId,
                enabled: true,
              },
            },
          },
        };
      },
    },
  })
  .withProcedures(({ mutation }) => ({
    recordActivity: mutation(recordActivityInputSchema).handler(
      async ({ req, db }) => {
        authorize(req, { organizationId: req.input.organizationId });

        const isInternal = !!req.context?.internalApiKey;
        if (!isInternal) {
          throw new Error("UNAUTHORIZED");
        }

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
  }));
