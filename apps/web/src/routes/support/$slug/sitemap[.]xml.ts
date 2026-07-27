import { createFileRoute } from "@tanstack/react-router";
import { formatISO, parseISO } from "date-fns";
import { XMLBuilder } from "fast-xml-parser";

import { fetchClient } from "~/lib/live-state";

const baseUrl = new URL(
  import.meta.env.VITE_BASE_URL ?? "http://localhost:3000"
);
const baseHostname = baseUrl.hostname;

export const Route = createFileRoute("/support/$slug/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // Fetch all organizations
        const organizations = await fetchClient.query.organization.list();

        // Fetch all threads for all organizations
        const allThreads = await fetchClient.query.thread.listAll();

        // Build the URL list
        const urls: {
          loc: string;
          changefreq: string;
          priority: number;
          lastmod?: string;
        }[] = [];

        // Add organization thread listing pages
        for (const org of organizations) {
          const orgUrl = `${baseUrl.protocol}//${org.slug}.${baseHostname}/threads`;
          urls.push({
            changefreq: "daily",
            loc: orgUrl,
            priority: 0.7,
          });
        }

        // Add individual thread pages
        for (const thread of allThreads) {
          const org = thread.organization;
          if (!org) {
            continue;
          }

          // Get the last message's createdAt date or the thread's createdAt date if no messages exist
          const lastModDateValue =
            thread?.messages?.[thread?.messages?.length - 1]?.createdAt ||
            thread.createdAt;
          const lastModDate =
            typeof lastModDateValue === "string"
              ? parseISO(lastModDateValue)
              : lastModDateValue;

          const threadUrl = `${baseUrl.protocol}//${org.slug}.${baseHostname}/threads/${thread.id}`;
          urls.push({
            changefreq: "daily",
            lastmod: formatISO(lastModDate),
            loc: threadUrl,
            priority: 0.9,
          });
        }

        // Build the XML
        const builder = new XMLBuilder({
          format: true,
          ignoreAttributes: false,
          indentBy: "  ",
        });

        const sitemapObj = {
          "?xml": {
            "@_encoding": "utf-8",
            "@_version": "1.0",
          },
          urlset: {
            "@_xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9",
            url: urls,
          },
        };

        const xmlContent = builder.build(sitemapObj);

        return new Response(xmlContent, {
          headers: {
            "Cache-Control": "public, max-age=3600",
            "Content-Type": "application/xml",
          },
        });
      },
    },
  },
});
