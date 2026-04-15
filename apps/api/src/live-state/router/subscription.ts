import { ulid } from "ulid";
import { z } from "zod";
import { authorize } from "../../lib/authorize";
import { privateRoute } from "../factories";
import { schema } from "../schema";

export const subscriptionRoute = privateRoute
  .collectionRoute(schema.subscription, {
    read: ({ ctx }) => {
      if (ctx?.internalApiKey) return true;
      if (!ctx?.session) return false;

      return {
        organization: {
          organizationUsers: {
            userId: ctx.session.userId,
            enabled: true,
            role: "owner",
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
    create: mutation(
      z.object({
        organizationId: z.string(),
        customerId: z.string().nullable().optional(),
        subscriptionId: z.string().nullable().optional(),
        plan: z.string().optional(),
        status: z.string().nullable().optional(),
        seats: z.number().optional(),
      }),
    ).handler(async ({ req, db }) => {
      authorize(req.context, {
        organizationId: req.input.organizationId,
        role: "owner",
      });

      const id = ulid().toLowerCase();
      const now = new Date();

      await db.subscription.insert({
        id,
        organizationId: req.input.organizationId,
        customerId: req.input.customerId ?? null,
        subscriptionId: req.input.subscriptionId ?? null,
        plan: req.input.plan ?? "trial",
        status: req.input.status ?? null,
        seats: req.input.seats ?? 1,
        createdAt: now,
        updatedAt: now,
      });

      return { id };
    }),

    update: mutation(
      z.object({
        id: z.string(),
        customerId: z.string().nullable().optional(),
        subscriptionId: z.string().nullable().optional(),
        plan: z.string().optional(),
        status: z.string().nullable().optional(),
        seats: z.number().optional(),
      }),
    ).handler(async ({ req, db }) => {
      const existing = await db.subscription.one(req.input.id).get();

      if (!existing) {
        throw new Error("SUBSCRIPTION_NOT_FOUND");
      }

      authorize(req.context, {
        organizationId: existing.organizationId,
        role: "owner",
      });

      const next: {
        customerId?: string | null;
        subscriptionId?: string | null;
        plan?: string;
        status?: string | null;
        seats?: number;
        updatedAt: Date;
      } = {
        updatedAt: new Date(),
      };

      if (req.input.customerId !== undefined) {
        next.customerId = req.input.customerId;
      }
      if (req.input.subscriptionId !== undefined) {
        next.subscriptionId = req.input.subscriptionId;
      }
      if (req.input.plan !== undefined) {
        next.plan = req.input.plan;
      }
      if (req.input.status !== undefined) {
        next.status = req.input.status;
      }
      if (req.input.seats !== undefined) {
        next.seats = req.input.seats;
      }

      await db.subscription.update(req.input.id, next);

      return { id: req.input.id };
    }),
  }));
