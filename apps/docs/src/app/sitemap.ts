import { source } from "@/lib/source";
import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3010";

export const revalidate = false;

export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string): string => new URL(path, baseUrl).toString();

  return source.getPages().map((page) => ({
    url: url(`/docs${page.url}`),
    lastModified: page.data.lastModified
      ? new Date(page.data.lastModified)
      : undefined,
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));
}
