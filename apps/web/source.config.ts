import { defineDocs, frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

export const docs = defineDocs({
  dir: "src/routes/_public/updates/posts",
  docs: {
    schema: frontmatterSchema.extend({
      publishedAt: z.string().or(z.date()),
      summary: z.string(),
      tag: z.string(),
      image: z.string(),
    }),
  },
});
