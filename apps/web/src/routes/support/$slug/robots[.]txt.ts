import { createFileRoute } from "@tanstack/react-router";
import { getRequestUrl } from "@tanstack/react-start/server";

const baseUrl = new URL(
  import.meta.env.VITE_BASE_URL ?? "http://localhost:3000"
);
const baseHostname = baseUrl.hostname;

export const Route = createFileRoute("/support/$slug/robots.txt")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const url = getRequestUrl();
          const hostname = url.hostname;

          // Check if accessed via subdomain (e.g., org-slug.tryfrontdesk.app)
          const suffixRegex = new RegExp(`\\.?${baseHostname}$`);
          const subdomain = hostname.replace(suffixRegex, "");

          let sitemapUrl: string;

          if (subdomain && subdomain !== hostname) {
            // Accessed via subdomain, sitemap is at subdomain/sitemap.xml
            sitemapUrl = `${url.protocol}//${hostname}/sitemap.xml`;
          } else {
            // Accessed via path, sitemap is at /support/$slug/sitemap.xml
            sitemapUrl = `${url.protocol}//${url.host}/support/${params.slug}/sitemap.xml`;
          }

          const robotsContent = `User-agent: *
Allow: /

Sitemap: ${sitemapUrl}
`;

          return new Response(robotsContent, {
            headers: {
              "Content-Type": "text/plain",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch {
          // Fallback: construct URL based on slug
          const sitemapUrl = `${baseUrl.protocol}//${params.slug}.${baseHostname}/sitemap.xml`;

          const robotsContent = `User-agent: *
Allow: /

Sitemap: ${sitemapUrl}
`;

          return new Response(robotsContent, {
            headers: {
              "Content-Type": "text/plain",
              "Cache-Control": "public, max-age=3600",
            },
          });
        }
      },
    },
  },
});

