import {
  autonomousActionMetadataSchema,
  parseAutonomousActionMetadata,
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
      // Receipts are written by the worker only — never by user sessions or
      // public API keys, otherwise a teammate could forge "FrontDesk handled
      // X" entries that show up in the leverage report.
      if (!req.context?.internalApiKey) {
        throw new Error("UNAUTHORIZED");
      }

      return db.autonomousAction.insert({
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
        organizationId: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      // Authorize against the caller-supplied org *before* loading the row so
      // a guessed id can't be probed across tenants.
      authorize(req.context, {
        organizationId: req.input.organizationId,
      });

      const rows = await db.autonomousAction
        .where({
          id: req.input.id,
          organizationId: req.input.organizationId,
        })
        .get();
      const row = rows[0];
      if (!row) throw new Error("AUTONOMOUS_ACTION_NOT_FOUND");
      if (row.undoneAt) return row;

      const metadata = parseAutonomousActionMetadata(row.metadataStr);
      const threadId = row.entityId;
      const now = new Date();

      let activityType: string | null = null;
      let activityMetadata: Record<string, unknown> = {
        source: "autonomous_undo",
      };

      if (metadata?.kind === "label") {
        const tls = await db.threadLabel
          .where({ threadId, labelId: metadata.labelId })
          .get();
        const tl = tls[0];
        if (tl?.enabled) {
          await db.threadLabel.update(tl.id, { enabled: false });
        }
        const labels = await db.label.where({ id: metadata.labelId }).get();
        activityType = "label_changed";
        activityMetadata = {
          action: "removed",
          labelId: metadata.labelId,
          labelName: labels[0]?.name ?? null,
          source: "autonomous_undo",
        };
      } else if (metadata?.kind === "linked_pr") {
        await db.thread.update(threadId, { externalPrId: null });
        activityType = "pr_changed";
        activityMetadata = {
          oldPrId: null,
          newPrId: null,
          oldPrLabel: "linked PR",
          newPrLabel: null,
          source: "autonomous_undo",
        };
      } else if (metadata?.kind === "duplicate") {
        await db.thread.update(threadId, { status: metadata.previousStatus });
        activityType = "marked_duplicate";
        activityMetadata = {
          duplicateOfThreadId: metadata.relatedThreadId,
          source: "autonomous_undo",
        };
      } else if (metadata?.kind === "status") {
        await db.thread.update(threadId, { status: metadata.previousStatus });
        activityType = "status_changed";
        activityMetadata = {
          newStatus: metadata.previousStatus,
          newStatusLabel: null,
          source: "autonomous_undo",
        };
      }

      if (activityType) {
        await db.update.insert({
          id: ulid().toLowerCase(),
          threadId,
          userId: req.context?.session?.userId ?? null,
          type: activityType,
          createdAt: now,
          metadataStr: JSON.stringify(activityMetadata),
          replicatedStr: JSON.stringify({}),
        });
      }

      return db.autonomousAction.update(row.id, { undoneAt: now });
    }),
  }));
