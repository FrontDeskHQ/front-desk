import { ulid } from "ulid";
import { z } from "zod";
import { reflagClient } from "../../lib/feature-flag";
import { enqueueCrawlDocumentation } from "../../lib/queue";
import { privateRoute } from "../factories";
import { schema } from "../schema";

const checkFeatureFlag = async (organizationId: string) => {
  const { isEnabled } = reflagClient
    .bindClient({ company: { id: organizationId } })
    .getFlag("documentation-crawler");

  if (!isEnabled) {
    throw new Error("Feature not available");
  }
};

export default privateRoute
  .collectionRoute(schema.documentationSource, {
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
    insert: ({ ctx }) => !!ctx?.internalApiKey,
    update: {
      preMutation: ({ ctx }) => !!ctx?.internalApiKey,
      postMutation: ({ ctx }) => !!ctx?.internalApiKey,
    },
  })
  .withMutations(({ mutation }) => ({
    addDocumentationSource: mutation(
      z.object({
        organizationId: z.string(),
        name: z.string().min(1),
        // TODO: SSRF risk — baseUrl accepts any valid URL but is used server-side (fetch in worker)
        // to crawl sitemap.xml and .md pages. Consider validating against internal/private IPs and
        // restricting to public HTTPS URLs.
        baseUrl: z.string().url(),
      }),
    ).handler(async ({ req, db }) => {
      const { organizationId, name, baseUrl } = req.input;

      // Authorization check
      if (!req.context?.internalApiKey && req.context?.session?.userId) {
        const selfOrgUser = Object.values(
          await db.find(schema.organizationUser, {
            where: {
              organizationId,
              userId: req.context.session.userId,
              enabled: true,
              role: "owner",
            },
          }),
        )[0];

        if (!selfOrgUser) {
          throw new Error("UNAUTHORIZED");
        }
      } else if (!req.context?.internalApiKey) {
        throw new Error("UNAUTHORIZED");
      }

      // Feature flag check
      await checkFeatureFlag(organizationId);

      const id = ulid().toLowerCase();
      const now = new Date();

      await db.insert(schema.documentationSource, {
        id,
        organizationId,
        name,
        baseUrl,
        status: "pending",
        lastCrawledAt: null,
        pageCount: 0,
        chunksIndexed: 0,
        errorStr: null,
        createdAt: now,
        updatedAt: now,
      });

      try {
        // TODO: baseUrl is passed to worker which fetches sitemap.xml and .md URLs — SSRF risk
        const jobId = await enqueueCrawlDocumentation({
          documentationSourceId: id,
          organizationId,
          baseUrl,
        });
        if (!jobId) {
          throw new Error("Queue unavailable: crawl job could not be scheduled");
        }
      } catch (err) {
        await db.update(schema.documentationSource, id, {
          status: "failed",
          errorStr: err instanceof Error ? err.message : "Failed to schedule crawl",
          updatedAt: new Date(),
        });
        throw err;
      }

      return { id };
    }),

    recrawlDocumentationSource: mutation(
      z.object({
        id: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      const { id } = req.input;

      const source = await db.findOne(schema.documentationSource, id);
      if (!source) {
        throw new Error("DOCUMENTATION_SOURCE_NOT_FOUND");
      }

      // Authorization check
      if (!req.context?.internalApiKey && req.context?.session?.userId) {
        const selfOrgUser = Object.values(
          await db.find(schema.organizationUser, {
            where: {
              organizationId: source.organizationId,
              userId: req.context.session.userId,
              enabled: true,
              role: "owner",
            },
          }),
        )[0];

        if (!selfOrgUser) {
          throw new Error("UNAUTHORIZED");
        }
      } else if (!req.context?.internalApiKey) {
        throw new Error("UNAUTHORIZED");
      }

      // Feature flag check
      await checkFeatureFlag(source.organizationId);

      const previousStatus = source.status;

      await db.update(schema.documentationSource, id, {
        status: "pending",
        errorStr: null,
        updatedAt: new Date(),
      });

      try {
        // TODO: baseUrl from DB is passed to worker which fetches sitemap.xml and .md URLs — SSRF risk
        const jobId = await enqueueCrawlDocumentation({
          documentationSourceId: id,
          organizationId: source.organizationId,
          baseUrl: source.baseUrl,
        });
        if (!jobId) {
          throw new Error("Queue unavailable: crawl job could not be scheduled");
        }
      } catch (err) {
        await db.update(schema.documentationSource, id, {
          status: previousStatus,
          updatedAt: new Date(),
        });
        throw err;
      }

      return { success: true };
    }),

    deleteDocumentationSource: mutation(
      z.object({
        id: z.string(),
      }),
    ).handler(async ({ req, db }) => {
      const { id } = req.input;

      const source = await db.findOne(schema.documentationSource, id);
      if (!source) {
        throw new Error("DOCUMENTATION_SOURCE_NOT_FOUND");
      }

      // Authorization check
      if (!req.context?.internalApiKey && req.context?.session?.userId) {
        const selfOrgUser = Object.values(
          await db.find(schema.organizationUser, {
            where: {
              organizationId: source.organizationId,
              userId: req.context.session.userId,
              enabled: true,
              role: "owner",
            },
          }),
        )[0];

        if (!selfOrgUser) {
          throw new Error("UNAUTHORIZED");
        }
      } else if (!req.context?.internalApiKey) {
        throw new Error("UNAUTHORIZED");
      }

      // Feature flag check
      await checkFeatureFlag(source.organizationId);

      await db.update(schema.documentationSource, id, {
        status: "deleted",
        updatedAt: new Date(),
      });

      return { success: true };
    }),
  }));
