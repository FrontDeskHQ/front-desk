import { createFileRoute } from "@tanstack/react-router";
import { XMLBuilder } from "fast-xml-parser";

const baseUrl = import.meta.env.BASE_URL || "http://localhost:3000";

const routes = [
  {
    loc: baseUrl,
    changefreq: "weekly",
    priority: 1.0,
  },
  {
    loc: `${baseUrl}sign-in`,
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    loc: `${baseUrl}sign-up`,
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    loc: `${baseUrl}legal/privacy-policy`,
    changefreq: "monthly",
    priority: 0.5,
  },
  {
    loc: `${baseUrl}legal/terms-of-service`,
    changefreq: "monthly",
    priority: 0.5,
  },
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
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
            url: routes,
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
