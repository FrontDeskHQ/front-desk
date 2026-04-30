import {
  autonomousActionMetadataSchema,
  signalTypeSchema,
} from "@workspace/schemas/signals";
import { ulid } from "ulid";
import z from "zod";
import { authorize } from "../../lib/authorize";
import { privateRoute } from "../factories";
import { schema } from "../schema";

export default privateRoute
  .collectionRoute(schema.autonomousAction, {
    read: ({ ctx }) => {
      if (ctx?.internalApiKey) return true;
      if (!ctx?.session) return false;

      return {
        organization: {
          organizationUsers: {
            userId: ctx.session.userId,
            enabled: true,
          },
        },
      };
    },
    insert: () => false,
    update: {
      preMutation: () => false,
      postMutation: () => false,
    },
  })
  .withProcedures(({ mutation }) => ({
    record: mutation(
      z.object({
        id: z.string().optional(),
        organizationId: z.string(),
        signalType: signalTypeSchema,
        entityId: z.string(),
        metadata: autonomousActionMetadataSchema,
      }),
    ).handler(async ({ req, db }) => {
      authorize(req.context, {
        organizationId: req.input.organizationId,
      });

      return db.insert(schema.autonomousAction, {
        id: req.input.id ?? ulid().toLowerCase(),
        organizationId: req.input.organizationId,
        signalType: req.input.signalType,
        entityId: req.input.entityId,
        appliedAt: new Date(),
        undoneAt: null,
        metadataStr: JSON.stringify(req.input.metadata),
      });
    }),
    undo: mutation(
      z.object({
        id: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      const row = await db.autonomousAction.one(req.input.id).get();
      if (!row) throw new Error("AUTONOMOUS_ACTION_NOT_FOUND");

      authorize(req.context, {
        organizationId: row.organizationId,
      });

      if (row.undoneAt) return row;

      return db.update(schema.autonomousAction, row.id, {
        undoneAt: new Date(),
      });
    }),
  }));
