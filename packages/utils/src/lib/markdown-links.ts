import type { Root } from "mdast";
import { visit } from "unist-util-visit";

import { parseRenderedMarkdown } from "./markdown-render";

export interface RenderedMarkdownLink {
  /** Offset of the link's first character in the source Markdown. */
  start: number;
  /** Offset just past the link's last character in the source Markdown. */
  end: number;
  url: string;
}

/**
 * Extract the explicit `[label](url)` Markdown links that the UI turns into
 * real anchors, with the source span each one occupies.
 *
 * Because this parses exactly like the renderer, links written inside code
 * spans, code fences, indented code, or a raw HTML block are correctly ignored
 * — they render as literal text, not as links. GFM autolinks and bare URLs are
 * ignored too: callers need a labelled anchor, which is what becomes a chip.
 */
export const extractRenderedMarkdownLinks = (
  markdown: string
): RenderedMarkdownLink[] => {
  const links: RenderedMarkdownLink[] = [];

  visit(parseRenderedMarkdown(markdown), "link", (node) => {
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    // An autolink literal (`https://…`) or `<https://…>` starts with something
    // other than `[`; only an explicit anchor renders with the label we need.
    if (
      typeof start === "number" &&
      typeof end === "number" &&
      markdown[start] === "["
    ) {
      links.push({ end, start, url: node.url });
    }
  });

  return links;
};

/** URLs of the explicit Markdown links the UI turns into real anchors. */
export const extractRenderedMarkdownLinkUrls = (markdown: string): string[] =>
  extractRenderedMarkdownLinks(markdown).map((link) => link.url);

/**
 * Remove every explicit Markdown link from the source, leaving the surrounding
 * prose. Useful for asking "does this text still mention X outside a link?".
 */
export const stripRenderedMarkdownLinks = (markdown: string): string => {
  const links = extractRenderedMarkdownLinks(markdown);
  let result = "";
  let cursor = 0;

  for (const link of links) {
    result += markdown.slice(cursor, link.start);
    cursor = link.end;
  }

  return result + markdown.slice(cursor);
};

/**
 * Build a remark plugin that rewrites link destinations in place.
 *
 * Use this instead of a regex over the Markdown source: it only ever touches
 * real link nodes, so custom link syntax is never rewritten inside code blocks,
 * code spans, or plain prose that merely looks like a link.
 */
export const remarkMapLinkUrls =
  (mapUrl: (url: string) => string | null) => () => (tree: Root) => {
    visit(tree, "link", (node) => {
      const mapped = mapUrl(node.url);
      if (mapped !== null) {
        node.url = mapped;
      }
    });
  };
