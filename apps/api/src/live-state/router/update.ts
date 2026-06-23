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
        const sessionUserId = req.context?.session?.userId ?? null;

        if (!isInternal && !sessionUserId) {
          throw new Error("UNAUTHORIZED");
        }

        const userId = isInternal
          ? (req.input.userId ?? null)
          : sessionUserId;

        const userName = isInternal
          ? (req.input.userName ?? null)
          : (req.input.userName ?? req.context?.user?.name ?? null);

        return runRecordActivity(db, {
          threadId: req.input.threadId,
          organizationId: req.input.organizationId,
          type: req.input.type,
          userId,
          userName,
          metadata: req.input.metadata,
          replicatedStr: req.input.replicatedStr,
          id: req.input.id,
          createdAt: req.input.createdAt,
        });
      },
    ),
  }));
