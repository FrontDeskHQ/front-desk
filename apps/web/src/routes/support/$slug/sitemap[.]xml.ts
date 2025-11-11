import { createFileRoute } from "@tanstack/react-router";
import { XMLBuilder } from "fast-xml-parser";
import { formatISO, parseISO } from "date-fns";
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
        const organizations = await fetchClient.query.organization.get();

        // Fetch all threads for all organizations
        const allThreads = await fetchClient.query.thread
          .include({ organization: true, messages: true })
          .get();

        // Build the URL list
        const urls: Array<{
          loc: string;
          changefreq: string;
          priority: number;
          lastmod?: string;
        }> = [];

        // Add organization thread listing pages
        for (const org of organizations) {
          const orgUrl = `${baseUrl.protocol}//${org.slug}.${baseHostname}/threads`;
          urls.push({
            loc: orgUrl,
            changefreq: "daily",
            priority: 0.9,
          });
        }

        // Add individual thread pages
        for (const thread of allThreads) {
          const org = thread.organization;
          if (!org) continue;

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
            loc: threadUrl,
            changefreq: "daily",
            priority: 0.7,
            lastmod: formatISO(lastModDate),
          });
        }

        // Build the XML
        const builder = new XMLBuilder({
          ignoreAttributes: false,
          format: true,
          indentBy: "  ",
        });

        const sitemapObj = {
          "?xml": {
            "@_version": "1.0",
            "@_encoding": "UTF-8",
          },
          urlset: {
            "@_xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9",
            url: urls,
          },
        };

        const xmlContent = builder.build(sitemapObj);

        return new Response(xmlContent, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
