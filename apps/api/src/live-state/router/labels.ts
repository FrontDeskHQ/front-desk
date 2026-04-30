import z from "zod";
import { ulid } from "ulid";
import type { ServerDB } from "@live-state/sync/server";
import type { AuthorizationContext } from "../../lib/authorize";
import { authorize } from "../../lib/authorize";
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
    id: args.id ?? ulid().toLowerCase(),
    organizationId: args.organizationId,
    name: args.name,
    color: args.color,
    enabled: args.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  };
};

/** Inserts a label row; works with `db` or transaction `trx`. */
const insertLabel = async (
  db: LabelInsertDb,
  args: Parameters<typeof buildInsertLabelRow>[0],
) => db.label.insert(buildInsertLabelRow(args));

type RequestWithAuthorizationContext = {
  context?: AuthorizationContext | null;
};

const getAuthorizedOrganizationIds = (
  req: RequestWithAuthorizationContext,
): string[] | null => {
  const ctx = req.context ?? {};

  if (ctx.internalApiKey) {
    return null;
  }

  if (ctx.publicApiKey) {
    return [ctx.publicApiKey.ownerId];
  }

  if (!ctx.orgUsers?.length) {
    return [];
  }

  return [...new Set(ctx.orgUsers.map((orgUser) => orgUser.organizationId))];
};

const findLabelForAuthorizedOrganizations = async (
  db: Pick<ServerDB<typeof schema>, "label">,
  labelId: string,
  organizationIds: string[] | null,
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
  organizationIds: string[] | null,
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
  label: publicRoute.collectionRoute(schema.label, {
    read: () => true,
    insert: () => false,
    update: {
      preMutation: () => false,
      postMutation: () => false,
    },
  }).withProcedures(({ mutation }) => ({
    create: mutation(
      z.object({
        id: z.string().optional(),
        organizationId: z.string(),
        name: z.string(),
        color: z.string(),
        enabled: z.boolean().optional(),
      }),
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

    update: mutation(
      z.object({
        labelId: z.string(),
        name: z.string().optional(),
        color: z.string().optional(),
        enabled: z.boolean().optional(),
        updatedAt: z.coerce.date().optional(),
      }),
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

    createAndAttachToThread: mutation(
      z.object({
        organizationId: z.string(),
        threadId: z.string(),
        name: z.string(),
        color: z.string(),
        labelId: z.string().optional(),
        threadLabelId: z.string().optional(),
      }),
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
          const insertedLabel = await insertLabel(trx, {
            id: req.input.labelId,
            organizationId: req.input.organizationId,
            name: req.input.name,
            color: req.input.color,
            enabled: true,
          });

          const insertedThreadLabel = await trx.threadLabel.insert({
            id: threadLabelId,
            threadId: req.input.threadId,
            labelId: insertedLabel.id,
            enabled: true,
          });

          return { insertedLabel, insertedThreadLabel };
        },
      );

      return {
        ...insertedThreadLabel,
        label: insertedLabel,
      };
    }),

    attachToThread: mutation(
      z.object({
        threadId: z.string(),
        labelId: z.string(),
        id: z.string().optional(),
      }),
    ).handler(async ({ req, db }) => {
      const authorizedOrganizationIds = getAuthorizedOrganizationIds(req);
      const label = await findLabelForAuthorizedOrganizations(
        db,
        req.input.labelId,
        authorizedOrganizationIds,
      );

      if (!label) {
        throw new Error("LABEL_NOT_FOUND");
      }

      const thread = await findThreadForAuthorizedOrganizations(
        db,
        req.input.threadId,
        authorizedOrganizationIds,
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

      const id = req.input.id ?? ulid().toLowerCase();
      const threadLabelId = await db.transaction(async ({ trx }) => {
        const existing = await trx.threadLabel
          .first({
            threadId: req.input.threadId,
            labelId: req.input.labelId,
          })
          .get();

        if (existing) {
          if (!existing.enabled) {
            await trx.threadLabel.update(existing.id, { enabled: true });
          }

          return existing.id;
        }

        try {
          const created = await trx.threadLabel.insert({
            id,
            threadId: req.input.threadId,
            labelId: req.input.labelId,
            enabled: true,
          });

          return created.id;
        } catch {
          const concurrent = await trx.threadLabel
            .first({
              threadId: req.input.threadId,
              labelId: req.input.labelId,
            })
            .get();

          if (concurrent) {
            if (!concurrent.enabled) {
              await trx.threadLabel.update(concurrent.id, { enabled: true });
            }

            return concurrent.id;
          }

          throw new Error("THREAD_LABEL_ATTACH_FAILED");
        }
      });

      const created = await db.threadLabel
        .one(threadLabelId)
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

    detachFromThread: mutation(
      z.object({
        threadLabelId: z.string(),
      }),
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

      const updated =
        (await db.threadLabel
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
  })),

  threadLabel: publicRoute.collectionRoute(schema.threadLabel, {
    read: () => true,
    insert: () => false,
    update: {
      preMutation: () => false,
      postMutation: () => false,
    },
  }),
};
