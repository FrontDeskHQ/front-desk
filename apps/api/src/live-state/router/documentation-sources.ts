import dns from "node:dns/promises";
import { ulid } from "ulid";
import { z } from "zod";
import { authorize } from "../../lib/authorize";
import { reflagClient } from "../../lib/feature-flag";
import { enqueueCrawlDocumentation } from "../../lib/queue";
import { privateRoute } from "../factories";
import { schema } from "../schema";

function isPrivateIP(ip: string): boolean {
  // IPv4 private/reserved ranges
  const parts = ip.split(".").map(Number);
  if (parts.length === 4) {
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (link-local / cloud metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0
    if (parts.every((p) => p === 0)) return true;
    // 100.64.0.0/10 (RFC 6598 CGN)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  }
  // IPv6 loopback and private
  if (ip === "::1" || ip === "::") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // ULA
  if (ip.startsWith("fe80")) return true; // link-local
  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const v4Mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4Mapped) return isPrivateIP(v4Mapped[1]);
  return false;
}

async function assertPublicUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs with credentials are not allowed");
  }
  const addresses = await dns.resolve4(parsed.hostname).catch(() => []);
  const addresses6 = await dns.resolve6(parsed.hostname).catch(() => []);
  const allAddresses = [...addresses, ...addresses6];
  if (allAddresses.length === 0) {
    throw new Error(`Could not resolve hostname: ${parsed.hostname}`);
  }
  for (const addr of allAddresses) {
    if (isPrivateIP(addr)) {
      throw new Error(
        "URLs resolving to private or reserved IP addresses are not allowed",
      );
    }
  }
}

async function validateDocumentationUrl(baseUrl: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  // 0. SSRF protection: enforce HTTPS and block private IPs
  try {
    await assertPublicUrl(baseUrl);
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Invalid URL",
    };
  }

  // 1. Check sitemap.xml exists
  const sitemapUrl = new URL("/sitemap.xml", baseUrl).href;
  let sitemapText: string;
  try {
    const res = await fetch(sitemapUrl, {
      headers: { "User-Agent": "FrontDesk-Crawler/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return {
        valid: false,
        error: `Sitemap not found at ${sitemapUrl} (HTTP ${res.status})`,
      };
    }
    sitemapText = await res.text();
  } catch {
    return { valid: false, error: `Could not reach ${sitemapUrl}` };
  }

  // 2. Extract up to 5 URLs from sitemap
  const locMatches = sitemapText.match(/<loc>(.*?)<\/loc>/g);
  if (!locMatches || locMatches.length === 0) {
    return { valid: false, error: "Sitemap contains no URLs" };
  }

  const baseOrigin = new URL(baseUrl).origin;
  const urls = locMatches
    .slice(0, 5)
    .map((m) => m.replace(/<\/?loc>/g, "").trim())
    .filter((u) => {
      try {
        return new URL(u, baseOrigin).origin === baseOrigin;
      } catch {
        return false;
      }
    });

  if (urls.length === 0) {
    return { valid: false, error: "No sitemap URLs match the base domain" };
  }

  // 3. Check if at least one URL has a .md or .mdx version (parallelized)
  const checks = urls.flatMap((url) =>
    [".md", ".mdx"].map(async (ext) => {
      const mdUrl = new URL(url, baseOrigin);
      mdUrl.pathname = mdUrl.pathname.replace(/\/$/, "") + ext;
      await assertPublicUrl(mdUrl.href);
      const res = await fetch(mdUrl.href, {
        method: "HEAD",
        headers: { "User-Agent": "FrontDesk-Crawler/1.0" },
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) return true;
      throw new Error("not found");
    }),
  );

  try {
    await Promise.any(checks);
    return { valid: true };
  } catch {
    return {
      valid: false,
      error: `None of the first ${urls.length} sitemap URLs have a .md or .mdx version available`,
    };
  }
}

const DOCUMENTATION_SOURCE_NAME_MAX_LENGTH = 100;

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
    validateDocumentationSource: mutation(
      z.object({
        organizationId: z.string(),
        baseUrl: z.string().url(),
      }),
    ).handler(async ({ req }) => {
      const { organizationId, baseUrl } = req.input;

      authorize(req.context, { organizationId, role: "owner" });

      await checkFeatureFlag(organizationId);

      return validateDocumentationUrl(baseUrl);
    }),

    addDocumentationSource: mutation(
      z.object({
        organizationId: z.string(),
        name: z
          .string()
          .min(1, "Name is required")
          .max(
            DOCUMENTATION_SOURCE_NAME_MAX_LENGTH,
            `Name must be at most ${DOCUMENTATION_SOURCE_NAME_MAX_LENGTH} characters`,
          ),
        baseUrl: z.string().url(),
      }),
    ).handler(async ({ req, db }) => {
      const { organizationId, name, baseUrl } = req.input;

      authorize(req.context, { organizationId, role: "owner" });

      // Feature flag check
      await checkFeatureFlag(organizationId);

      // SSRF protection: enforce HTTPS and block private IPs
      await assertPublicUrl(baseUrl);

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
        const jobId = await enqueueCrawlDocumentation({
          documentationSourceId: id,
          organizationId,
          baseUrl,
        });
        if (!jobId) {
          throw new Error(
            "Queue unavailable: crawl job could not be scheduled",
          );
        }
      } catch (err) {
        await db.update(schema.documentationSource, id, {
          status: "failed",
          errorStr:
            err instanceof Error ? err.message : "Failed to schedule crawl",
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

      authorize(req.context, {
        organizationId: source.organizationId,
        role: "owner",
      });

      // Feature flag check
      await checkFeatureFlag(source.organizationId);

      // SSRF protection: re-validate stored URL before recrawl
      await assertPublicUrl(source.baseUrl);

      const previousStatus = source.status;

      await db.update(schema.documentationSource, id, {
        status: "pending",
        errorStr: null,
        updatedAt: new Date(),
      });

      try {
        const jobId = await enqueueCrawlDocumentation({
          documentationSourceId: id,
          organizationId: source.organizationId,
          baseUrl: source.baseUrl,
        });
        if (!jobId) {
          throw new Error(
            "Queue unavailable: crawl job could not be scheduled",
          );
        }
      } catch (err) {
        await db.update(schema.documentationSource, id, {
          status: previousStatus,
          errorStr:
            err instanceof Error ? err.message : "Failed to schedule crawl",
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

      authorize(req.context, {
        organizationId: source.organizationId,
        role: "owner",
      });

      // Feature flag check
      await checkFeatureFlag(source.organizationId);

      await db.update(schema.documentationSource, id, {
        status: "deleted",
        updatedAt: new Date(),
      });

      return { success: true };
    }),
  }));
