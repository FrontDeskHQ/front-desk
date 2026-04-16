import { InviteUserEmail } from "@workspace/emails/transactional/org-invitation";
import { addDays } from "date-fns";
import { ulid } from "ulid";
import { z } from "zod";
import { authorize } from "../../lib/authorize";
import { resend } from "../../lib/resend";
import { privateRoute } from "../factories";
import { schema } from "../schema";

export const inviteRoute = privateRoute
  .collectionRoute(schema.invite, {
    read: ({ ctx }) => {
      if (ctx?.internalApiKey) return true;
      if (!ctx?.session) return false;

      return {
        $or: [
          {
            organization: {
              organizationUsers: {
                userId: ctx.session.userId,
                enabled: true,
              },
            },
          },
          {
            email: ctx?.user?.email,
          },
        ],
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
        email: z.email().array(),
      }),
    ).handler(async ({ req, db }) => {
      if (!req.context.session?.userId) {
        throw new Error("UNAUTHORIZED");
      }

      const orgId = req.input.organizationId;

      authorize(req.context, {
        organizationId: orgId,
        role: "owner",
      });

      const selfOrgUser = await db.organizationUser
        .first({
          organizationId: orgId,
          userId: req.context.session.userId,
        })
        .get();

      if (!selfOrgUser || selfOrgUser.role !== "owner") {
        throw new Error("UNAUTHORIZED");
      }

      const [inviter, organization] = await Promise.all([
        db.user.one(selfOrgUser.userId).get(),
        db.organization.one(orgId).get(),
      ]);

      if (!inviter || !organization) {
        throw new Error("UNAUTHORIZED");
      }

      const existingMembers = await db.organizationUser
        .where({ organizationId: orgId })
        .include({ user: true })
        .get();

      const existingInvites = (
        await db.invite.where({ organizationId: orgId, active: true }).get()
      ).filter((invite) => invite.expiresAt > new Date());

      const filteredEmails = Array.from(
        new Set(req.input.email.map((e) => e.trim().toLowerCase())),
      ).filter(
        (email) =>
          !existingMembers.some(
            (member) => member.user?.email.toLowerCase() === email,
          ) &&
          !existingInvites.some(
            (invite) => invite.email.toLowerCase() === email,
          ),
      );

      await Promise.allSettled(
        filteredEmails.map(async (email) => {
          const inviteId = ulid().toLowerCase();

          await db.invite.insert({
            id: inviteId,
            organizationId: req.input.organizationId,
            creatorId: req.context.session.userId,
            email,
            createdAt: new Date(),
            expiresAt: addDays(new Date(), 7),
            active: true,
          });

          await resend.emails
            .send({
              from: "FrontDesk <notifications@tryfrontdesk.app>",
              to: [email],
              subject: `${inviter.name} invited you to join ${organization.name} on FrontDesk`,
              react: InviteUserEmail({
                invitedByName: inviter.name,
                organizationName: organization.name,
                organizationImage: organization.logoUrl ?? undefined,
                inviteLink: `https://tryfrontdesk.app/app/invitation/${inviteId}`,
              }),
            })
            .catch((error) => {
              console.error("Error sending email", error);
            });
        }),
      );

      return {
        success: true as const,
      };
    }),

    cancel: mutation(z.object({ id: z.string() })).handler(async ({ req, db }) => {
      if (!req.context.session?.userId) {
        throw new Error("UNAUTHORIZED");
      }

      const invite = await db.invite.one(req.input.id).get();

      if (!invite) {
        throw new Error("INVITATION_NOT_FOUND");
      }

      authorize(req.context, {
        organizationId: invite.organizationId,
        role: "owner",
      });

      await db.invite.update(req.input.id, {
        active: false,
      });

      return {
        success: true as const,
      };
    }),

    accept: mutation(z.object({ id: z.string() })).handler(async ({ req, db }) => {
      await db.transaction(async ({ trx }) => {
        const invite = await trx.invite.one(req.input.id).get();

        if (!invite) {
          throw new Error("INVITATION_NOT_FOUND");
        }

        if (invite.email !== req.context?.user?.email) {
          throw new Error("INVALID_USER");
        }

        await trx.organizationUser.insert({
          id: ulid().toLowerCase(),
          organizationId: invite.organizationId,
          userId: req.context.session.userId,
          enabled: true,
          role: "user",
        });

        await trx.invite.update(req.input.id, {
          active: false,
        });
      });

      if (req.context?.user?.email) {
        try {
          await db.allowlist.insert({
            id: ulid().toLowerCase(),
            email: req.context.user.email.toLowerCase(),
          });
        } catch {
          // Silently ignore errors (e.g., duplicate email)
        }
      }

      return {
        success: true as const,
      };
    }),

    decline: mutation(z.object({ id: z.string() })).handler(async ({ req, db }) => {
      const invite = await db.invite.one(req.input.id).get();

      if (!invite) {
        throw new Error("INVITATION_NOT_FOUND");
      }

      if (invite.email !== req.context?.user?.email) {
        throw new Error("INVALID_USER");
      }

      await db.invite.update(req.input.id, {
        active: false,
      });

      return {
        success: true as const,
      };
    }),
  }));
