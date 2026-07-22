import type { MetadataRoute } from "next";

import { source } from "@/lib/source";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3010";

export const revalidate = false;

export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string): string => new URL(path, baseUrl).toString();

  return source.getPages().map((page) => ({
    changeFrequency: "weekly" as const,
    lastModified: page.data.lastModified
      ? new Date(page.data.lastModified)
      : undefined,
    priority: 0.5,
    url: url(`/docs${page.url}`),
  }));
}
