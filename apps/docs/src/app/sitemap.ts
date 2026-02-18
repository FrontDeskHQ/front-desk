import { source } from "@/lib/source";
import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3010";

export const revalidate = false;

export default function sitemap(): MetadataRoute.Sitemap {
  const docsBaseUrl = new URL("/docs", baseUrl).toString();
  const url = (path: string): string => new URL(path, docsBaseUrl).toString();

  return [
    {
      url: url("/"),
      changeFrequency: "monthly",
      priority: 1,
    },
    ...source.getPages().map((page) => ({
      url: url(page.url),
      lastModified: page.data.lastModified
        ? new Date(page.data.lastModified)
        : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
