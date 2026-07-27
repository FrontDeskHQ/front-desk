import type { ServerDB } from "@live-state/sync/server";
import { ulid } from "ulid";
import z from "zod";

import { authorize, getAuthorizedOrganizationIds } from "../../lib/authorize";
import { runAttachLabelToThread } from "../../lib/label-mutations";
import { publicRoute } from "../factories";
import { schema } from "../schema";

type LabelInsertDb = Pick<ServerDB<typeof schema>, "label">;

const buildInsertLabelRow = (args: {
  organizationId: string;
  name: string;
  color: string;
  id?: string;
  enabled?: boolean;
}) => {
  const now = new Date();

  return {
    color: args.color,
    createdAt: now,
    enabled: args.enabled ?? true,
    id: args.id ?? ulid().toLowerCase(),
    name: args.name,
    organizationId: args.organizationId,
    updatedAt: now,
  };
};

/** Inserts a label row; works with `db` or transaction `trx`. */
const insertLabel = async (
  db: LabelInsertDb,
  args: Parameters<typeof buildInsertLabelRow>[0]
) => db.label.insert(buildInsertLabelRow(args));

const findLabelForAuthorizedOrganizations = async (
  db: Pick<ServerDB<typeof schema>, "label">,
  labelId: string,
  organizationIds: string[] | null
) => {
  if (organizationIds === null) {
    return await db.label.one(labelId).get();
  }

  for (const organizationId of organizationIds) {
    const label = await db.label
      .first({
        id: labelId,
        organizationId,
      })
      .get();

    if (label) {
      return label;
    }
  }

  return null;
};

const findThreadForAuthorizedOrganizations = async (
  db: Pick<ServerDB<typeof schema>, "thread">,
  threadId: string,
  organizationIds: string[] | null
) => {
  if (organizationIds === null) {
    return await db.thread.one(threadId).get();
  }

  for (const organizationId of organizationIds) {
    const thread = await db.thread
      .first({
        id: threadId,
        organizationId,
      })
      .get();

    if (thread) {
      return thread;
    }
  }

  return null;
};

export default {
  label: publicRoute.withProcedures(({ mutation, query }) => ({
    attachToThread: mutation(
      z.object({
        threadId: z.string(),
        labelId: z.string(),
        id: z.string().optional(),
      })
    ).handler(async ({ req, db }) => {
      const authorizedOrganizationIds = getAuthorizedOrganizationIds(req);
      const label = await findLabelForAuthorizedOrganizations(
        db,
        req.input.labelId,
        authorizedOrganizationIds
      );

      if (!label) {
        throw new Error("LABEL_NOT_FOUND");
      }

      const thread = await findThreadForAuthorizedOrganizations(
        db,
        req.input.threadId,
        authorizedOrganizationIds
      );

      if (!thread) {
        throw new Error("THREAD_NOT_FOUND");
      }

      if (label.organizationId !== thread.organizationId) {
        throw new Error("LABEL_THREAD_ORGANIZATION_MISMATCH");
      }

      authorize(req, {
        organizationId: thread.organizationId,
      });

      const attachResult = await runAttachLabelToThread(
        db,
        {
          threadId: req.input.threadId,
          labelId: req.input.labelId,
          organizationId: thread.organizationId,
          threadLabelId: req.input.id,
        },
        { preloadedThread: thread, preloadedLabel: label }
      );

      const created = await db.threadLabel
        .one(attachResult.threadLabelId)
        .include({ label: true })
        .get();

      if (!created) {
        throw new Error("THREAD_LABEL_ATTACH_FAILED");
      }

      return {
        ...created,
        label: created.label ?? label,
      };
    }),

    create: mutation(
      z.object({
        id: z.string().optional(),
        organizationId: z.string(),
        name: z.string(),
        color: z.string(),
        enabled: z.boolean().optional(),
      })
    ).handler(async ({ req, db }) => {
      authorize(req, {
        organizationId: req.input.organizationId,
      });

      return await insertLabel(db, {
        id: req.input.id,
        organizationId: req.input.organizationId,
        name: req.input.name,
        color: req.input.color,
        enabled: req.input.enabled,
      });
    }),

    createAndAttachToThread: mutation(
      z.object({
        organizationId: z.string(),
        threadId: z.string(),
        name: z.string(),
        color: z.string(),
        labelId: z.string().optional(),
        threadLabelId: z.string().optional(),
      })
    ).handler(async ({ req, db }) => {
      authorize(req, {
        organizationId: req.input.organizationId,
      });

      const thread = await db.thread.one(req.input.threadId).get();

      if (!thread || thread.organizationId !== req.input.organizationId) {
        throw new Error("THREAD_NOT_FOUND");
      }

      const threadLabelId = req.input.threadLabelId ?? ulid().toLowerCase();

      const { insertedLabel, insertedThreadLabel } = await db.transaction(
        async ({ trx }) => {
          const label = await insertLabel(trx, {
            id: req.input.labelId,
            organizationId: req.input.organizationId,
            name: req.input.name,
            color: req.input.color,
            enabled: true,
          });

          const threadLabel = await trx.threadLabel.insert({
            id: threadLabelId,
            threadId: req.input.threadId,
            labelId: label.id,
            enabled: true,
          });

          return { insertedLabel: label, insertedThreadLabel: threadLabel };
        }
      );

      return {
        ...insertedThreadLabel,
        label: insertedLabel,
      };
    }),

    detachFromThread: mutation(
      z.object({
        threadLabelId: z.string(),
      })
    ).handler(async ({ req, db }) => {
      const authorizedOrganizationIds = getAuthorizedOrganizationIds(req);
      const tl = await db.threadLabel
        .one(req.input.threadLabelId)
        .include({ thread: true, label: true })
        .get();

      if (!tl) {
        throw new Error("THREAD_LABEL_NOT_FOUND");
      }

      const thread = tl.thread;

      if (!thread) {
        throw new Error("THREAD_NOT_FOUND");
      }

      if (
        authorizedOrganizationIds &&
        !authorizedOrganizationIds.includes(thread.organizationId)
      ) {
        throw new Error("THREAD_LABEL_NOT_FOUND");
      }

      authorize(req, {
        organizationId: thread.organizationId,
      });

      await db.threadLabel.update(req.input.threadLabelId, { enabled: false });

      const updated = (await db.threadLabel
        .one(req.input.threadLabelId)
        .include({ label: true })
        .get()) ?? {
        id: tl.id,
        threadId: tl.threadId,
        labelId: tl.labelId,
        enabled: false,
        label: tl.label,
      };

      return updated;
    }),

    /** Org's labels (optionally only enabled) — worker inline-label processor. */
    forOrg: query(
      z.object({
        organizationId: z.string(),
        enabled: z.boolean().optional(),
      })
    ).handler(async ({ req, db }) => {
      authorize(req, { organizationId: req.input.organizationId });
      return Object.values(
        await db.find(schema.label, {
          where: {
            organizationId: req.input.organizationId,
            ...(req.input.enabled === undefined
              ? {}
              : { enabled: req.input.enabled }),
          },
        })
      );
    }),

    update: mutation(
      z.object({
        labelId: z.string(),
        name: z.string().optional(),
        color: z.string().optional(),
        enabled: z.boolean().optional(),
        updatedAt: z.coerce.date().optional(),
      })
    ).handler(async ({ req, db }) => {
      const label = await db.label.one(req.input.labelId).get();

      if (!label) {
        throw new Error("LABEL_NOT_FOUND");
      }

      authorize(req, {
        organizationId: label.organizationId,
      });

      await db.label.update(req.input.labelId, {
        name: req.input.name,
        color: req.input.color,
        enabled: req.input.enabled,
        updatedAt: req.input.updatedAt ?? new Date(),
      });

      return (await db.label.one(req.input.labelId).get()) ?? label;
    }),
  })),

  // `threadLabel` no longer needs a route: it is written via the label
  // attach/detach procedures and read as part of the org tree (thread.labels).
  // A resource is queryable by virtue of being in the schema (live-state 1.0).
};
