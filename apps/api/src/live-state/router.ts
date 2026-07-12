// TODO refactor with new live-state mental model
import { isCapability } from "@connectors/framework";
import { router as createRouter } from "@live-state/sync/server";
import { InviteUserEmail } from "@workspace/emails/transactional/org-invitation";
import { organizationSettingsSchema } from "@workspace/schemas/organization";
import {
  type ActionAutonomyMap,
  actionAutonomyMapSchema,
  actionKindSchema,
  autonomyLevelSchema,
  getDefaultActionAutonomy,
  REVERSIBLE_ACTIONS,
} from "@workspace/schemas/signals";
import { addDays, addYears } from "date-fns";
import { ulid } from "ulid";
import { z } from "zod";
import { publicKeys } from "../lib/api-key";
import {
  assertInviteRecipient,
  authorize,
  authorizeSelfOrInternal,
  getWorkspaceActor,
  requireInternalApiKey,
} from "../lib/authorize";
import { connectorRegistry } from "../lib/connector-registry";
import { dodopayments } from "../lib/payment";
import { resend } from "../lib/resend";
import { sendWelcomeEmail } from "../trigger/send-welcome-email";
import { privateRoute, publicRoute } from "./factories";
import { agentChatRoute } from "./router/agent-chat";
import autonomousActionRoute from "./router/autonomous-action";
import documentationSourcesRoute from "./router/documentation-sources";
import externalEntityRoute from "./router/external-entity";
import integrationRoute from "./router/integration";
import labelsRoute from "./router/labels";
import messageRoute from "./router/message";
import onboardingRoute from "./router/onboarding";
import { pipelineRoutes } from "./router/pipeline";
import threadsRoute from "./router/threads";
import updateRoute from "./router/update";
import { schema } from "./schema";

const RESERVED_ORG_SLUGS: readonly string[] = [
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

export const router = createRouter({
  schema,
  routes: {
    organization: publicRoute.withProcedures(({ mutation, query }) => ({
      /** Single organization by slug — public portal shell. */
      bySlug: query(z.object({ slug: z.string() })).handler(
        async ({ db, req }) =>
          Object.values(
            await db.find(schema.organization, {
              where: { slug: req.input.slug.toLowerCase() },
            }),
          )[0],
      ),
      /** Single organization by id — cli, worker, integration bots. */
      byId: query(z.object({ id: z.string() })).handler(async ({ db, req }) =>
        db.organization.one(req.input.id).get(),
      ),
      /** All organizations — cli listing and public sitemap generation. */
      list: query().handler(async ({ db }) =>
        Object.values(await db.find(schema.organization, {})),
      ),
      // Un-executed query returned to integration clients (discord/slack/
      // github), which load it via `client.load`. The whole-tree read has no
      // per-resource backstop now (live-state 1.0), so it is gated to internal
      // bot keys — the only callers — to avoid leaking every org's data.
      load: query().handler(({ db, req }) => {
        requireInternalApiKey(req.context);
        return db.organization.include({
          threads: {
            include: {
              messages: {
                include: {
                  author: {
                    include: { user: true },
                  },
                },
              },
              updates: {
                include: { user: true },
              },
              labels: {
                include: { label: true },
              },
              author: {
                include: { user: true },
              },
            },
          },
          integrations: true,
          authors: {
            include: { user: true },
          },
        });
      }),
      create: mutation(
        z.object({
          name: z.string(),
          slug: z
            .string()
            .min(4)
            .refine(
              (slug) => !RESERVED_ORG_SLUGS.includes(slug.toLowerCase()),
              {
                message: "This slug is reserved and cannot be used",
              },
            ),
        }),
      ).handler(async ({ req, db }) => {
        const actor = getWorkspaceActor(req);
        const userEmail = req.context?.user?.email;
        const userName = req.context?.user?.name ?? actor.userName ?? undefined;
        const organizationId = ulid().toLowerCase();

        const dodopaymentsCustomer = await dodopayments?.customers.create({
          email: userEmail,
          name: userName,
        });

        const organization = await db.insert(schema.organization, {
          id: organizationId,
          name: req.input!.name,
          slug: req.input!.slug,
          createdAt: new Date(),
          logoUrl: null,
          socials: null,
          customInstructions: null,
          settings: {
            timezone: "UTC",
            digest: {
              pendingReplyThresholdMinutes: 30,
              time: "09:00",
              slackChannelId: null,
              slackChannelName: null,
              lastDigestSentAt: null,
            },
            actionAutonomy: getDefaultActionAutonomy(),
            plan: "trial",
            subscriptionStatus: null,
          },
        });

        await db.insert(schema.subscription, {
          id: ulid().toLowerCase(),
          organizationId,
          customerId: dodopaymentsCustomer?.customer_id ?? null,
          subscriptionId: null,
          plan: "trial",
          status: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await db.insert(schema.organizationUser, {
          id: ulid().toLowerCase(),
          organizationId,
          userId: actor.userId,
          enabled: true,
          role: "owner",
        });

        // Send welcome email if this is the user's first organization
        const userMemberships = Object.values(
          await db.find(schema.organizationUser, {
            where: {
              userId: actor.userId,
            },
          }),
        );

        if (userMemberships.length === 1 && userEmail && userName) {
          const delayMinutes = Math.floor(Math.random() * 21) + 20;

          sendWelcomeEmail
            .trigger(
              {
                email: userEmail,
                name: userName,
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
      setActionAutonomy: mutation(
        z.object({
          organizationId: z.string(),
          actionKind: actionKindSchema,
          level: autonomyLevelSchema,
        }),
      ).handler(async ({ req, db }) => {
        authorize(req, {
          organizationId: req.input.organizationId,
          role: "owner",
        });

        if (
          req.input.level === "auto" &&
          !REVERSIBLE_ACTIONS.has(req.input.actionKind)
        ) {
          throw new Error("ACTION_KIND_LOCKED_FROM_AUTO");
        }

        const org = await db.organization.one(req.input.organizationId).get();
        if (!org) throw new Error("ORGANIZATION_NOT_FOUND");

        // Preserve raw settings — only touch actionAutonomy. Avoid
        // safeParseOrgSettings here because it returns the schema defaults
        // when the existing settings fail validation, which would silently
        // overwrite unrelated keys we don't know about yet.
        const rawSettings =
          org.settings &&
          typeof org.settings === "object" &&
          !Array.isArray(org.settings)
            ? (org.settings as Record<string, unknown>)
            : {};
        const parsedAutonomy = actionAutonomyMapSchema.safeParse(
          rawSettings.actionAutonomy,
        );
        const nextAutonomy: ActionAutonomyMap = {
          ...getDefaultActionAutonomy(),
          ...(parsedAutonomy.success ? parsedAutonomy.data : {}),
          [req.input.actionKind]: req.input.level,
        };

        return db.organization.update(org.id, {
          settings: {
            ...rawSettings,
            actionAutonomy: nextAutonomy,
            // biome-ignore lint/suspicious/noExplicitAny: settings JSON shape is open
          } as any,
        });
      }),
      setCapabilityPrimary: mutation(
        z.object({
          organizationId: z.string(),
          capability: z.string(),
          integrationId: z.string(),
        }),
      ).handler(async ({ req, db }) => {
        authorize(req, {
          organizationId: req.input.organizationId,
          role: "owner",
        });

        const { capability, integrationId } = req.input;
        if (!isCapability(capability)) {
          throw new Error("UNKNOWN_CAPABILITY");
        }

        // The pinned integration must belong to the org, be enabled, and its
        // connector must actually provide the capability being pinned.
        const integration = await db.findOne(schema.integration, integrationId);
        if (
          !integration ||
          integration.organizationId !== req.input.organizationId ||
          !integration.enabled
        ) {
          throw new Error("INTEGRATION_NOT_FOUND");
        }
        // An integration can be enabled before it's configured; pinning an
        // unconfigured one would route agent creates to a target that fails at
        // dispatch, so require a config here too.
        if (!integration.configStr) {
          throw new Error("INTEGRATION_NOT_CONFIGURED");
        }
        const entry = connectorRegistry.getByType(integration.type);
        if (!entry?.manifest.capabilities.includes(capability)) {
          throw new Error("CAPABILITY_NOT_PROVIDED");
        }

        const org = await db.organization.one(req.input.organizationId).get();
        if (!org) throw new Error("ORGANIZATION_NOT_FOUND");

        // Preserve raw settings — only touch capabilityPrimary. Avoid
        // safeParseOrgSettings here because it returns schema defaults when
        // the existing settings fail validation, which would silently
        // overwrite unrelated keys we don't know about yet.
        const rawSettings =
          org.settings &&
          typeof org.settings === "object" &&
          !Array.isArray(org.settings)
            ? (org.settings as Record<string, unknown>)
            : {};
        const existingPrimary =
          rawSettings.capabilityPrimary &&
          typeof rawSettings.capabilityPrimary === "object" &&
          !Array.isArray(rawSettings.capabilityPrimary)
            ? (rawSettings.capabilityPrimary as Record<string, string>)
            : {};

        return db.organization.update(org.id, {
          settings: {
            ...rawSettings,
            capabilityPrimary: {
              ...existingPrimary,
              [capability]: integrationId,
            },
            // biome-ignore lint/suspicious/noExplicitAny: settings JSON shape is open
          } as any,
        });
      }),
      updateSettings: mutation(
        z
          .object({
            organizationId: z.string(),
            name: z.string().optional(),
            slug: z
              .string()
              .min(4)
              .refine(
                (slug) => !RESERVED_ORG_SLUGS.includes(slug.toLowerCase()),
                {
                  message: "This slug is reserved and cannot be used",
                },
              )
              .optional(),
            logoUrl: z.string().nullable().optional(),
            socials: z.string().nullable().optional(),
            customInstructions: z.string().nullable().optional(),
            // `capabilityPrimary` is intentionally excluded: it must go through
            // `setCapabilityPrimary`, which validates the capability and that the
            // pinned integration is enabled, configured, and provides it.
            settings: organizationSettingsSchema
              .omit({ capabilityPrimary: true })
              .optional(),
          })
          .refine(
            (input) => {
              const { organizationId: _organizationId, ...fields } = input;
              return Object.values(fields).some((value) => value !== undefined);
            },
            { message: "NO_FIELDS_TO_UPDATE" },
          ),
      ).handler(async ({ req, db }) => {
        authorize(req, {
          organizationId: req.input.organizationId,
          role: "owner",
        });

        const org = await db.organization.one(req.input.organizationId).get();
        if (!org) throw new Error("ORGANIZATION_NOT_FOUND");

        const {
          organizationId: _organizationId,
          name,
          slug,
          logoUrl,
          socials,
          customInstructions,
          settings,
        } = req.input;

        const rawSettings =
          org.settings &&
          typeof org.settings === "object" &&
          !Array.isArray(org.settings)
            ? (org.settings as Record<string, unknown>)
            : {};

        return db.organization.update(org.id, {
          ...(name !== undefined ? { name } : {}),
          ...(slug !== undefined ? { slug } : {}),
          ...(logoUrl !== undefined ? { logoUrl } : {}),
          ...(socials !== undefined ? { socials } : {}),
          ...(customInstructions !== undefined ? { customInstructions } : {}),
          ...(settings !== undefined
            ? {
                settings: {
                  ...rawSettings,
                  ...settings,
                  // biome-ignore lint/suspicious/noExplicitAny: settings JSON shape is open
                } as any,
              }
            : {}),
        });
      }),
      createPublicApiKey: mutation(
        z.object({
          organizationId: z.string(),
          expiresAt: z.iso.datetime().optional(),
          name: z.string().optional(),
        }),
      ).handler(async ({ req, db }) => {
        const organizationId = req.input.organizationId;

        authorize(req, { organizationId, role: "owner" });

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
        const publicApiKey = await publicKeys.findById(req.input.id);

        if (!publicApiKey) {
          throw new Error("PUBLIC_API_KEY_NOT_FOUND");
        }

        authorize(req, {
          organizationId: publicApiKey.metadata.ownerId,
          role: "owner",
          allowInternalApiKey: false,
        });

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

        authorize(req, { organizationId, role: "owner" });

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
    })),
    organizationUser: privateRoute.withProcedures(({ mutation, query }) => ({
      /**
       * The caller's own org memberships (each with its organization) — SSR
       * loaders (billing, onboarding, workspace shell). Always scoped to the
       * session user; `withSubscriptions` includes billing state for the
       * owner-facing billing screen.
       */
      forUser: query(
        z.object({
          enabledOnly: z.boolean().optional(),
          withSubscriptions: z.boolean().optional(),
        }),
      ).handler(async ({ req, db }) => {
        const userId = req.context?.session?.userId;
        if (!userId) throw new Error("UNAUTHORIZED");
        return db.organizationUser
          .where({
            userId,
            ...(req.input.enabledOnly ? { enabled: true } : {}),
            // Subscriptions are owner-only: when requested, restrict to the
            // caller's owner memberships so billing data never leaks to
            // non-owner members.
            ...(req.input.withSubscriptions ? { role: "owner" } : {}),
          })
          .include({
            organization: req.input.withSubscriptions
              ? { include: { subscriptions: true } }
              : true,
          })
          .get();
      }),
      // Un-executed query returned to the client, which loads it via
      // `useLoadData`. Scoped to the session user server-side so the client
      // never dictates which user's memberships (and org data) to sync.
      load: query().handler(({ req, db }) =>
        db.organizationUser
          .where({ userId: req.context!.session!.userId })
          .include({
            organization: {
              include: {
                threads: {
                  include: {
                    messages: {
                      include: { author: true },
                    },
                    updates: {
                      include: { user: true },
                    },
                    labels: {
                      include: { label: true },
                    },
                    author: true,
                    assignedUser: true,
                  },
                },
                invites: true,
                integrations: true,
                // `subscriptions` is intentionally NOT synced here: it carries
                // billing identifiers and is owner-only (see subscription.forOrg).
                // Feature-gating state lives in organization.settings (plan,
                // subscriptionStatus), which syncs to every member.
                labels: true,
                organizationUsers: {
                  include: { user: true },
                },
                authors: true,
                onboardings: true,
                documentationSources: true,
                // TODO improve this to load only when needed
                agentChats: {
                  include: { messages: true },
                },
                autonomousActions: true,
                externalEntities: true,
              },
            },
          }),
      ),
      inviteUser: mutation(
        z.object({
          organizationId: z.string(),
          email: z.email().array(),
        }),
      ).handler(async ({ req, db }) => {
        const orgId = req.input!.organizationId;

        authorize(req, {
          organizationId: orgId,
          role: "owner",
          allowInternalApiKey: false,
        });

        const selfOrgUser = Object.values(
          await db.find(schema.organizationUser, {
            where: {
              organizationId: orgId,
              userId: req.context!.session!.userId,
            },
            include: {
              user: true,
              organization: true,
            },
          }),
        )[0] as any;

        const existingMembers = Object.values(
          await db.find(schema.organizationUser, {
            where: {
              organizationId: orgId,
            },
            include: {
              user: true,
            },
          }),
        );

        const existingInvites = Object.values(
          await db.find(schema.invite, {
            where: {
              organizationId: orgId,
              active: true,
              expiresAt: {
                $gt: new Date(),
              },
            },
          }),
        );

        // TODO follow https://github.com/pedroscosta/live-state/issues/74
        const filteredEmails = Array.from(
          new Set(req.input!.email.map((e) => e.trim().toLowerCase())),
        ).filter(
          (email) =>
            !existingMembers.some(
              (member) => (member as any).user?.email.toLowerCase() === email,
            ) &&
            !existingInvites.some(
              (invite) => (invite as any).email.toLowerCase() === email,
            ),
        );

        await Promise.allSettled(
          filteredEmails.map(async (email) => {
            const inviteId = ulid().toLowerCase();
            await db.insert(schema.invite, {
              id: inviteId,
              organizationId: req.input!.organizationId,
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
                subject: `${selfOrgUser.user.name} invited you to join ${selfOrgUser.organization.name} on FrontDesk`,
                react: InviteUserEmail({
                  invitedByName: selfOrgUser.user.name,
                  organizationName: selfOrgUser.organization.name,
                  organizationImage: selfOrgUser.organization.logoUrl,
                  inviteLink: `https://tryfrontdesk.app/app/invitation/${inviteId}`,
                }),
              })
              .catch((error) => {
                console.error("Error sending email", error);
              });
          }),
        );

        return {
          success: true,
        };
      }),
      updateMember: mutation(
        z
          .object({
            organizationUserId: z.string(),
            role: z.enum(["owner", "user"]).optional(),
            enabled: z.boolean().optional(),
          })
          .refine(
            (input) => {
              const { organizationUserId: _organizationUserId, ...fields } =
                input;
              return Object.values(fields).some((value) => value !== undefined);
            },
            { message: "NO_FIELDS_TO_UPDATE" },
          ),
      ).handler(async ({ req, db }) => {
        const member = await db.organizationUser
          .one(req.input.organizationUserId)
          .get();
        if (!member) throw new Error("ORGANIZATION_USER_NOT_FOUND");

        authorize(req, {
          organizationId: member.organizationId,
          role: "owner",
        });

        if (
          member.userId === req.context?.session?.userId &&
          (req.input.enabled === false ||
            (req.input.role !== undefined && req.input.role !== member.role))
        ) {
          throw new Error("CANNOT_UPDATE_SELF");
        }

        const {
          organizationUserId: _organizationUserId,
          role,
          enabled,
        } = req.input;

        return db.organizationUser.update(member.id, {
          ...(role !== undefined ? { role } : {}),
          ...(enabled !== undefined ? { enabled } : {}),
        });
      }),
    })),
    user: publicRoute.withProcedures(({ mutation }) => ({
      updateProfile: mutation(
        z
          .object({
            userId: z.string(),
            name: z.string().optional(),
            email: z.string().optional(),
            image: z.string().nullable().optional(),
          })
          .refine(
            (input) => {
              const { userId: _userId, ...fields } = input;
              return Object.values(fields).some((value) => value !== undefined);
            },
            { message: "NO_FIELDS_TO_UPDATE" },
          ),
      ).handler(async ({ req, db }) => {
        authorizeSelfOrInternal(req, req.input.userId);

        const existing = await db.user.one(req.input.userId).get();
        if (!existing) throw new Error("USER_NOT_FOUND");

        const { userId: _userId, name, email, image } = req.input;

        return db.user.update(existing.id, {
          ...(name !== undefined ? { name } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(image !== undefined ? { image } : {}),
        });
      }),
    })),
    author: publicRoute.withProcedures(({ query }) => ({
      /** Authors by id (batch) — worker message-role resolution. */
      byIds: query(z.object({ ids: z.array(z.string()) })).handler(
        async ({ db, req }) => {
          if (req.input.ids.length === 0) return [];
          return Object.values(
            await db.find(schema.author, {
              where: { id: { $in: req.input.ids } },
            }),
          );
        },
      ),
    })),
    invite: privateRoute.withProcedures(({ mutation, query }) => ({
      /** Single invite by id, with org + creator — invitation accept page. */
      byId: query(z.object({ id: z.string() })).handler(async ({ db, req }) => {
        const invite = await db.invite
          .one(req.input.id)
          .include({ organization: true, creator: true })
          .get();
        if (!invite) return undefined;
        // Only the recipient, an org member, or an internal key may read
        // the invite (which exposes email, org, and creator).
        const callerEmail = req.context?.user?.email?.toLowerCase();
        if (callerEmail !== invite.email.toLowerCase()) {
          authorize(req, { organizationId: invite.organizationId });
        }
        return invite;
      }),
      /** Active, unexpired invites for an email — onboarding join prompt. */
      forEmail: query(z.object({ email: z.string() })).handler(
        async ({ db, req }) => {
          // Invites are stored lowercased; normalize so casing differences
          // don't hide a valid invite.
          const email = req.input.email.toLowerCase();
          // Callers may only look up their own email (internal keys excepted).
          if (
            !req.context?.internalApiKey &&
            req.context?.user?.email?.toLowerCase() !== email
          ) {
            throw new Error("UNAUTHORIZED");
          }
          return db.invite
            .where({
              email,
              active: true,
              expiresAt: { $gt: new Date() },
            })
            .include({ organization: true })
            .get();
        },
      ),
      accept: mutation(z.object({ id: z.string() })).handler(
        async ({ req, db }) => {
          await db.transaction(async ({ trx }) => {
            const invite = await trx.findOne(schema.invite, req.input!.id);

            if (!invite) {
              throw new Error("INVITATION_NOT_FOUND");
            }

            assertInviteRecipient(req, invite.email);

            const actor = getWorkspaceActor(req);

            await trx.insert(schema.organizationUser, {
              id: ulid().toLowerCase(),
              organizationId: invite.organizationId,
              userId: actor.userId,
              enabled: true,
              role: "user",
            });

            await trx.update(schema.invite, req.input!.id, {
              active: false,
            });
          });

          if (req.context?.user?.email) {
            try {
              await db.insert(schema.allowlist, {
                id: ulid().toLowerCase(),
                email: req.context.user.email.toLowerCase(),
              });
            } catch {
              // Silently ignore errors (e.g., duplicate email)
            }
          }

          return {
            success: true,
          };
        },
      ),
      decline: mutation(z.object({ id: z.string() })).handler(
        async ({ req, db }) => {
          const invite = await db.findOne(schema.invite, req.input!.id);

          if (!invite) {
            throw new Error("INVITATION_NOT_FOUND");
          }

          assertInviteRecipient(req, invite.email);

          await db.update(schema.invite, req.input!.id, {
            active: false,
          });

          return {
            success: true,
          };
        },
      ),
      revoke: mutation(z.object({ inviteId: z.string() })).handler(
        async ({ req, db }) => {
          const invite = await db.invite.one(req.input.inviteId).get();
          if (!invite) throw new Error("INVITATION_NOT_FOUND");

          authorize(req, {
            organizationId: invite.organizationId,
            role: "owner",
          });

          return db.invite.update(invite.id, { active: false });
        },
      ),
    })),
    integration: integrationRoute,
    allowlist: privateRoute.withProcedures(({ query }) => ({
      /** Whether an email is allowlisted — app gate in `beforeLoad`. */
      forEmail: query(z.object({ email: z.string() })).handler(
        async ({ db, req }) => {
          const email = req.input.email.toLowerCase();
          // Callers may only check their own email (internal keys excepted).
          if (
            !req.context?.internalApiKey &&
            req.context?.user?.email?.toLowerCase() !== email
          ) {
            throw new Error("UNAUTHORIZED");
          }
          return Object.values(
            await db.find(schema.allowlist, { where: { email } }),
          )[0];
        },
      ),
    })),
    subscription: privateRoute.withProcedures(({ query }) => ({
      /**
       * Subscription for an org — billing UI and the integration bots' backfill
       * gate. Owner-only for sessions (matching the old read clause); internal
       * bot keys read freely.
       */
      forOrg: query(z.object({ organizationId: z.string() })).handler(
        async ({ db, req }) => {
          authorize(req, {
            organizationId: req.input.organizationId,
            role: "owner",
          });
          return Object.values(
            await db.find(schema.subscription, {
              where: { organizationId: req.input.organizationId },
            }),
          )[0];
        },
      ),
    })),
    // Mirror of external issues/PRs. Default mutators are disabled; writes go
    // through the route's custom `upsert` / `softDelete` procedures.
    externalEntity: externalEntityRoute,
    thread: threadsRoute,
    update: updateRoute,
    message: messageRoute,
    autonomousAction: autonomousActionRoute,
    onboarding: onboardingRoute,
    documentationSource: documentationSourcesRoute,
    agentChat: agentChatRoute,
    ...labelsRoute,
    ...pipelineRoutes,
  },
});

export type Router = typeof router;
