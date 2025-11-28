import { loader } from "fumadocs-core/source";
import { updates } from "fumadocs-mdx:collections/server";

export const source = loader({
  baseUrl: "/updates",
  source: updates.toFumadocsSource(),
});
