import { defineDocs, frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

export const docs = defineDocs({
  dir: "src/routes/_public/updates/posts",
  docs: {
    schema: frontmatterSchema.extend({
      date: z.string().or(z.date()),
      author: z.string().optional(),
    }),
  },
});
