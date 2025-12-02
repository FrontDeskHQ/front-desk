import { defineDocs, frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

export const updates = defineDocs({
  dir: "src/routes/_public/updates/posts",
  docs: {
    schema: frontmatterSchema.extend({
      publishedAt: z.iso.date(),
      summary: z.string().optional(),
      tag: z.string().optional(),
      image: z.string().optional(),
    }),
  },
});
