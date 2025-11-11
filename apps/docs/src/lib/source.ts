import { docs } from "@/.source";
import { type InferPageType, loader } from "fumadocs-core/source";
import * as icons from "lucide-static";

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
  icon(icon) {
    if (!icon) {
      return;
    }

    if (icon in icons) return icons[icon as keyof typeof icons];
  },
});

function getBaseUrl(): string {
  // Priority order:
  // 1. NEXT_PUBLIC_BASE_URL - explicitly set base URL
  // 2. VERCEL_URL - automatically set by Vercel (prepend https://)
  // 3. Default to localhost for development
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3010";
}

export function getPageImage(page: InferPageType<typeof source>) {
  const segments = [...page.slugs, "image.png"];
  const relativeUrl = `/docs/og/${segments.join("/")}`;
  const baseUrl = getBaseUrl();

  return {
    segments,
    url: `${baseUrl}${relativeUrl}`,
  };
}

export async function getLLMText(page: InferPageType<typeof source>) {
  const processed = await page.data.getText("processed");

  return `# ${page.data.title}

${processed}`;
}
