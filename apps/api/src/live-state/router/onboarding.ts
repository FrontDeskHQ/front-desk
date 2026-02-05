import { ulid } from "ulid";
import { z } from "zod";
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
    insert: ({ ctx }) => {
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
    update: {
      preMutation: ({ ctx }) => {
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
      postMutation: ({ ctx }) => {
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
    },
  })
  .withMutations(({ mutation }) => ({
    initialize: mutation(
      z.object({
        organizationId: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      const organizationId = req.input.organizationId;

      // Check authorization
      if (!req.context?.internalApiKey && req.context?.session?.userId) {
        const selfOrgUser = Object.values(
          await db.find(schema.organizationUser, {
            where: {
              organizationId,
              userId: req.context.session.userId,
              enabled: true,
            },
          }),
        )[0];

        if (!selfOrgUser) {
          throw new Error("UNAUTHORIZED");
        }
      } else if (!req.context?.internalApiKey) {
        throw new Error("UNAUTHORIZED");
      }

      // Check if onboarding already exists
      const existing = Object.values(
        await db.find(schema.onboarding, {
          where: { organizationId },
        }),
      )[0];

      if (existing) {
        return { id: existing.id, alreadyExists: true };
      }

      const id = ulid().toLowerCase();
      await db.insert(schema.onboarding, {
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

      const onboarding = await db.findOne(schema.onboarding, onboardingId);
      if (!onboarding) {
        throw new Error("ONBOARDING_NOT_FOUND");
      }

      // Authorization check
      if (!req.context?.internalApiKey && req.context?.session?.userId) {
        const selfOrgUser = Object.values(
          await db.find(schema.organizationUser, {
            where: {
              organizationId: onboarding.organizationId,
              userId: req.context.session.userId,
              enabled: true,
            },
          }),
        )[0];

        if (!selfOrgUser) {
          throw new Error("UNAUTHORIZED");
        }
      } else if (!req.context?.internalApiKey) {
        throw new Error("UNAUTHORIZED");
      }

      const steps = JSON.parse(onboarding.stepsStr || "{}");
      steps[stepId] = { completedAt: new Date().toISOString() };

      await db.update(schema.onboarding, onboardingId, {
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

      const onboarding = await db.findOne(schema.onboarding, onboardingId);
      if (!onboarding) {
        throw new Error("ONBOARDING_NOT_FOUND");
      }

      // Authorization check
      if (!req.context?.internalApiKey && req.context?.session?.userId) {
        const selfOrgUser = Object.values(
          await db.find(schema.organizationUser, {
            where: {
              organizationId: onboarding.organizationId,
              userId: req.context.session.userId,
              enabled: true,
            },
          }),
        )[0];

        if (!selfOrgUser) {
          throw new Error("UNAUTHORIZED");
        }
      } else if (!req.context?.internalApiKey) {
        throw new Error("UNAUTHORIZED");
      }

      await db.update(schema.onboarding, onboardingId, {
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

      const onboarding = await db.findOne(schema.onboarding, onboardingId);
      if (!onboarding) {
        throw new Error("ONBOARDING_NOT_FOUND");
      }

      // Authorization check
      if (!req.context?.internalApiKey && req.context?.session?.userId) {
        const selfOrgUser = Object.values(
          await db.find(schema.organizationUser, {
            where: {
              organizationId: onboarding.organizationId,
              userId: req.context.session.userId,
              enabled: true,
            },
          }),
        )[0];

        if (!selfOrgUser) {
          throw new Error("UNAUTHORIZED");
        }
      } else if (!req.context?.internalApiKey) {
        throw new Error("UNAUTHORIZED");
      }

      await db.update(schema.onboarding, onboardingId, {
        status: "completed",
        updatedAt: new Date(),
      });

      return { success: true };
    }),
  }));
