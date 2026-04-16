import { addYears } from "date-fns";
import { ulid } from "ulid";
import { z } from "zod";
import { publicKeys } from "../../lib/api-key";
import { authorize } from "../../lib/authorize";
import { dodopayments } from "../../lib/payment";
import { sendWelcomeEmail } from "../../trigger/send-welcome-email";
import { publicRoute } from "../factories";
import { schema } from "../schema";

const organizationUpdateInput = z.object({
  id: z.string(),
  name: z.string().optional(),
  slug: z.string().optional(),
  logoUrl: z.string().nullable().optional(),
  socials: z.string().nullable().optional(),
  customInstructions: z.string().nullable().optional(),
  settings: z.any().nullable().optional(),
});

export const organizationRoute = publicRoute
  .collectionRoute(schema.organization, {
    read: () => true,
    insert: () => false,
    update: {
      preMutation: () => false,
      postMutation: () => false,
    },
  })
  .withProcedures(({ mutation }) => ({
    create: mutation(
      z.object({
        name: z.string(),
        slug: z
          .string()
          .min(4)
          .refine(
            (slug) => {
              const reservedSlugs = [
                "support",
                "help",
                "status",
                "api",
                "admin",
                "www",
                "app",
                "dashboard",
                "login",
                "signup",
                "register",
                "account",
                "settings",
                "billing",
                "docs",
                "documentation",
                "blog",
                "about",
                "contact",
                "privacy",
                "terms",
                "legal",
              ];
              return !reservedSlugs.includes(slug.toLowerCase());
            },
            {
              message: "This slug is reserved and cannot be used",
            },
          ),
      }),
    ).handler(async ({ req, db }) => {
      if (!req.context.session?.userId) {
        throw new Error("UNAUTHORIZED");
      }

      const organizationId = ulid().toLowerCase();

      const dodopaymentsCustomer = await dodopayments?.customers.create({
        email: req.context.user?.email,
        name: req.context.user?.name,
      });

      const organization = await db.organization.insert({
        id: organizationId,
        name: req.input!.name,
        slug: req.input!.slug,
        createdAt: new Date(),
        logoUrl: null,
        socials: null,
        customInstructions: null,
        settings: null,
      });

      await db.subscription.insert({
        id: ulid().toLowerCase(),
        organizationId,
        customerId: dodopaymentsCustomer?.customer_id ?? null,
        subscriptionId: null,
        plan: "trial",
        status: null,
        seats: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.organizationUser.insert({
        id: ulid().toLowerCase(),
        organizationId,
        userId: req.context.session.userId,
        enabled: true,
        role: "owner",
      });

      const userMemberships = await db.organizationUser
        .where({ userId: req.context.session.userId })
        .get();

      if (userMemberships.length === 1) {
        const delayMinutes = Math.floor(Math.random() * 21) + 20;

        sendWelcomeEmail
          .trigger(
            {
              email: req.context.user!.email,
              name: req.context.user!.name,
            },
            { delay: `${delayMinutes}m` },
          )
          .catch((err) => {
            console.error("Failed to schedule welcome email", err);
          });
      }

      return {
        success: true,
        organization,
      };
    }),

    update: mutation(organizationUpdateInput).handler(async ({ req, db }) => {
      if (!req.context.internalApiKey) {
        if (!req.context.session?.userId) {
          throw new Error("UNAUTHORIZED");
        }

        authorize(req.context, {
          organizationId: req.input.id,
          role: "owner",
        });
      }

      const row = await db.organization.one(req.input.id).get();
      if (!row) {
        throw new Error("ORGANIZATION_NOT_FOUND");
      }

      const hasField =
        req.input.name !== undefined ||
        req.input.slug !== undefined ||
        req.input.logoUrl !== undefined ||
        req.input.socials !== undefined ||
        req.input.customInstructions !== undefined ||
        req.input.settings !== undefined;

      if (!hasField) {
        throw new Error("UPDATE_REQUIRES_FIELDS");
      }

      await db.organization.update(req.input.id, {
        ...(req.input.name !== undefined ? { name: req.input.name } : {}),
        ...(req.input.slug !== undefined ? { slug: req.input.slug } : {}),
        ...(req.input.logoUrl !== undefined ? { logoUrl: req.input.logoUrl } : {}),
        ...(req.input.socials !== undefined ? { socials: req.input.socials } : {}),
        ...(req.input.customInstructions !== undefined
          ? { customInstructions: req.input.customInstructions }
          : {}),
        ...(req.input.settings !== undefined ? { settings: req.input.settings } : {}),
      });

      return { success: true as const };
    }),

    createPublicApiKey: mutation(
      z.object({
        organizationId: z.string(),
        expiresAt: z.iso.datetime().optional(),
        name: z.string().optional(),
      }),
    ).handler(async ({ req, db }) => {
      const organizationId = req.input.organizationId;

      let authorized = !!req.context?.internalApiKey;

      if (!authorized && req.context?.session?.userId) {
        const selfOrgUser = await db.organizationUser
          .first({
            organizationId,
            userId: req.context.session.userId,
          })
          .get();

        authorized = !!selfOrgUser && selfOrgUser.role === "owner";
      }

      if (!authorized) {
        throw new Error("UNAUTHORIZED");
      }

      const publicApiKey = await publicKeys.create({
        ownerId: organizationId,
        tags: ["organization"],
        expiresAt:
          req.input.expiresAt ?? addYears(new Date(), 1).toISOString(),
        name: req.input.name,
      });

      return {
        id: publicApiKey.record.id,
        key: publicApiKey.key,
        expiresAt: publicApiKey.record.metadata.expiresAt,
        name: publicApiKey.record.metadata.name,
      };
    }),

    revokePublicApiKey: mutation(
      z.object({
        id: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      if (!req.context?.session?.userId) {
        throw new Error("UNAUTHORIZED");
      }

      const publicApiKey = await publicKeys.findById(req.input.id);

      if (!publicApiKey) {
        throw new Error("PUBLIC_API_KEY_NOT_FOUND");
      }

      const selfOrgUser = await db.organizationUser
        .first({
          organizationId: publicApiKey.metadata.ownerId,
          userId: req.context.session.userId,
        })
        .get();

      if (!selfOrgUser || selfOrgUser.role !== "owner") {
        throw new Error("UNAUTHORIZED");
      }

      await publicKeys.revoke(publicApiKey.id).catch((error) => {
        console.error("Error revoking public API key", error);
        throw new Error("FAILED_TO_REVOKE_PUBLIC_API_KEY");
      });

      return {
        success: true,
      };
    }),

    listApiKeys: mutation(
      z.object({
        organizationId: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      const organizationId = req.input.organizationId;

      let authorized = !!req.context?.internalApiKey;

      if (!authorized && req.context?.session?.userId) {
        const selfOrgUser = await db.organizationUser
          .first({
            organizationId,
            userId: req.context.session.userId,
          })
          .get();

        authorized = !!selfOrgUser && selfOrgUser.role === "owner";
      }

      if (!authorized) {
        throw new Error("UNAUTHORIZED");
      }

      const apiKeys = await publicKeys.list(organizationId);

      return apiKeys
        .filter((apiKey) => !apiKey.metadata.revokedAt)
        .map((apiKey) => ({
          id: apiKey.id,
          expiresAt: apiKey.metadata.expiresAt,
          name: apiKey.metadata.name,
          type: "public",
          createdAt: apiKey.metadata.createdAt,
        }));
    }),
  }));
