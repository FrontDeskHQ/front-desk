import { createFileRoute } from "@tanstack/react-router";
import { XMLBuilder } from "fast-xml-parser";

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
