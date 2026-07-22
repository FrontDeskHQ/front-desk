import { createFileRoute } from "@tanstack/react-router";
import { XMLBuilder } from "fast-xml-parser";

import { fetchClient } from "~/lib/live-state";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const baseUrl =
          import.meta.env.VITE_BASE_URL || "http://localhost:3000";

        const routes = [
          {
            changefreq: "weekly",
            loc: baseUrl,
            priority: 1,
          },
          {
            changefreq: "monthly",
            loc: `${baseUrl}/sign-in`,
            priority: 0.8,
          },
          {
            changefreq: "monthly",
            loc: `${baseUrl}/sign-up`,
            priority: 0.8,
          },
          {
            changefreq: "monthly",
            loc: `${baseUrl}/legal/privacy-policy`,
            priority: 0.5,
          },
          {
            changefreq: "monthly",
            loc: `${baseUrl}/legal/terms-of-service`,
            priority: 0.5,
          },
        ];

        const organizations = await fetchClient.query.organization.list();

        const baseUrlObj = new URL(baseUrl);

        routes.push(
          ...organizations.map((org) => {
            const tempUrlObj = new URL(baseUrlObj.toString());
            tempUrlObj.hostname = `${org.slug}.${baseUrlObj.hostname}`;

            return {
              changefreq: "daily",
              loc: tempUrlObj.toString(),
              priority: 0.9,
            };
          })
        );

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
            url: routes,
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
