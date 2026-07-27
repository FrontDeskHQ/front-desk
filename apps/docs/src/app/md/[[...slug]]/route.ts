import type { InferPageType } from "fumadocs-core/source";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { source } from "@/lib/source";

export const revalidate = false;

async function getLLMText(page: InferPageType<typeof source>) {
  const processed = await page.data.getText("processed");

  return `# ${page.data.title} (${page.url})

${processed}`;
}

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ slug?: string[] }> }
) {
  console.log("GET /[[...slug]].md");
  const { slug } = await props.params;
  const page = source.getPage(slug);

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const content = await getLLMText(page);

  return new Response(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
