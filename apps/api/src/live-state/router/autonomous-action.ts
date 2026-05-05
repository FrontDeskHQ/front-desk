import {
  type AutonomousActionMetadata,
  autonomousActionMetadataSchema,
  parseAutonomousActionMetadata,
  type SignalType,
  signalTypeSchema,
  STATUS_LABELS,
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
      if (!metadata) throw new Error("AUTONOMOUS_ACTION_METADATA_INVALID");
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
        const threads = await db.thread.where({ id: threadId }).get();
        const oldPrId = threads[0]?.externalPrId ?? null;
        await db.thread.update(threadId, { externalPrId: null });
        activityType = "pr_changed";
        activityMetadata = {
          oldPrId,
          newPrId: null,
          oldPrLabel: oldPrId ? "linked PR" : null,
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
          newStatusLabel: STATUS_LABELS[metadata.previousStatus] ?? null,
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
    seedFake: mutation(
      z.object({
        organizationId: z.string(),
        count: z.number().min(1).max(50).default(8),
      }),
    ).handler(async ({ req, db }) => {
      if (process.env.NODE_ENV === "production") {
        throw new Error("DEV_ONLY");
      }
      authorize(req, { organizationId: req.input.organizationId });

      const types: SignalType[] = [
        "label",
        "duplicate",
        "linked_pr",
        "status",
        "pending_reply",
      ];
      const now = Date.now();
      const rows = [];
      for (let i = 0; i < req.input.count; i++) {
        const signalType = types[Math.floor(Math.random() * types.length)]!;
        const appliedAt = new Date(
          now - Math.floor(Math.random() * 24 * 60 * 60 * 1000),
        );
        const metadata: AutonomousActionMetadata | null =
          signalType === "label"
            ? { kind: "label", labelId: `fake-label-${ulid().toLowerCase()}` }
            : signalType === "linked_pr"
              ? { kind: "linked_pr", prId: `fake-pr-${ulid().toLowerCase()}` }
              : signalType === "duplicate"
                ? {
                    kind: "duplicate",
                    relatedThreadId: `fake-thread-${ulid().toLowerCase()}`,
                    score: Math.random(),
                    previousStatus: 0,
                  }
                : signalType === "status"
                  ? { kind: "status", previousStatus: 0 }
                  : null;
        const row = await db.autonomousAction.insert({
          id: ulid().toLowerCase(),
          organizationId: req.input.organizationId,
          signalType,
          entityId: `fake-${ulid().toLowerCase()}`,
          appliedAt,
          undoneAt: null,
          metadataStr: metadata ? JSON.stringify(metadata) : null,
        });
        rows.push(row);
      }
      return { inserted: rows.length };
    }),
    clearFake: mutation(
      z.object({ organizationId: z.string() }),
    ).handler(async ({ req, db }) => {
      if (process.env.NODE_ENV === "production") {
        throw new Error("DEV_ONLY");
      }
      authorize(req, { organizationId: req.input.organizationId });

      const now = new Date();
      const rows = await db.autonomousAction
        .where({ organizationId: req.input.organizationId, undoneAt: null })
        .get();
      for (const row of rows) {
        await db.autonomousAction.update(row.id, { undoneAt: now });
      }
      return { cleared: rows.length };
    }),
  }));
