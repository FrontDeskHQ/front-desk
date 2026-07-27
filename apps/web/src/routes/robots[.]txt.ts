import { createFileRoute } from "@tanstack/react-router";
import { getRequestUrl } from "@tanstack/react-start/server";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () => {
        const baseUrl =
          import.meta.env.VITE_BASE_URL || "http://localhost:3000";

        try {
          const url = getRequestUrl();
          const sitemapUrl = `${url.protocol}//${url.host}/sitemap.xml`;

          const robotsContent = `User-agent: *
Allow: /

Sitemap: ${sitemapUrl}
`;

          return new Response(robotsContent, {
            headers: {
              "Cache-Control": "public, max-age=3600",
              "Content-Type": "text/plain",
            },
          });
        } catch {
          const sitemapUrl = `${baseUrl}/sitemap.xml`;

          const robotsContent = `User-agent: *
Allow: /

Sitemap: ${sitemapUrl}
`;

          return new Response(robotsContent, {
            headers: {
              "Cache-Control": "public, max-age=3600",
              "Content-Type": "text/plain",
            },
          });
        }
      },
    },
  },
});
