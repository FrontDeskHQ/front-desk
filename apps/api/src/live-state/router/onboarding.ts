import { ulid } from "ulid";
import { z } from "zod";
import { authorize } from "../../lib/authorize";
import { privateRoute } from "../factories";
import { schema } from "../schema";

export default privateRoute
  .collectionRoute(schema.onboarding, {
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
    create: mutation(
      z.object({
        organizationId: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      const organizationId = req.input.organizationId;

      if (!req.context.internalApiKey) {
        if (!req.context.session?.userId) {
          throw new Error("UNAUTHORIZED");
        }
        authorize(req.context, { organizationId });
      }

      const existing = await db.onboarding
        .first({ organizationId })
        .get();

      if (existing) {
        return { id: existing.id, alreadyExists: true };
      }

      const id = ulid().toLowerCase();
      await db.onboarding.insert({
        id,
        organizationId,
        stepsStr: "{}",
        status: "incomplete",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return { id, alreadyExists: false };
    }),

    completeStep: mutation(
      z.object({
        onboardingId: z.string(),
        stepId: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      const { onboardingId, stepId } = req.input;

      const onboarding = await db.onboarding.one(onboardingId).get();
      if (!onboarding) {
        throw new Error("ONBOARDING_NOT_FOUND");
      }

      if (!req.context.internalApiKey) {
        if (!req.context.session?.userId) {
          throw new Error("UNAUTHORIZED");
        }
        authorize(req.context, { organizationId: onboarding.organizationId });
      }

      const steps = JSON.parse(onboarding.stepsStr || "{}");
      steps[stepId] = { completedAt: new Date().toISOString() };

      await db.onboarding.update(onboardingId, {
        stepsStr: JSON.stringify(steps),
        updatedAt: new Date(),
      });

      return { success: true };
    }),

    skip: mutation(
      z.object({
        onboardingId: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      const { onboardingId } = req.input;

      const onboarding = await db.onboarding.one(onboardingId).get();
      if (!onboarding) {
        throw new Error("ONBOARDING_NOT_FOUND");
      }

      if (!req.context.internalApiKey) {
        if (!req.context.session?.userId) {
          throw new Error("UNAUTHORIZED");
        }
        authorize(req.context, { organizationId: onboarding.organizationId });
      }

      await db.onboarding.update(onboardingId, {
        status: "skipped",
        updatedAt: new Date(),
      });

      return { success: true };
    }),

    complete: mutation(
      z.object({
        onboardingId: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      const { onboardingId } = req.input;

      const onboarding = await db.onboarding.one(onboardingId).get();
      if (!onboarding) {
        throw new Error("ONBOARDING_NOT_FOUND");
      }

      if (!req.context.internalApiKey) {
        if (!req.context.session?.userId) {
          throw new Error("UNAUTHORIZED");
        }
        authorize(req.context, { organizationId: onboarding.organizationId });
      }

      await db.onboarding.update(onboardingId, {
        status: "completed",
        updatedAt: new Date(),
      });

      return { success: true };
    }),
  }));
