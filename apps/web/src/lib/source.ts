import { docs } from "fumadocs-mdx:collections/server";
import { loader } from "fumadocs-core/source";

export const source = loader({
  baseUrl: "/updates",
  source: docs.toFumadocsSource(),
});
