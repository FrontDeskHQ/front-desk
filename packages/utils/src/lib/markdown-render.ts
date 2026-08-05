import type { Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";

/**
 * The UI renders Markdown with Streamdown, which does **not** enable
 * `rehype-raw`. Instead it replaces every raw `html` mdast node with a plain
 * `text` node, so agent-authored HTML shows up as literal, escaped text and is
 * never interpreted as markup.
 *
 * Anything that reasons about what the reader will actually see — link
 * validation, sanitization, eval scoring — must parse Markdown the same way, or
 * it will disagree with the UI. This plugin is that shared behaviour; build
 * pipelines from the helpers below rather than hand-rolling a parser.
 *
 * Verified against Streamdown 2.5: with no `rehypePlugins` passed it appends
 * exactly this transform, then runs `remark-rehype` with `allowDangerousHtml`.
 */
export const remarkHtmlAsText = () => (tree: Root) => {
  visit(tree, "html", (node, index, parent) => {
    if (!parent || typeof index !== "number") {
      return;
    }
    parent.children[index] = { type: "text", value: node.value };
  });
};

const mdastPipeline = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkHtmlAsText);

const markdownStringifier = unified().use(remarkStringify).use(remarkGfm);

/**
 * Parse Markdown into the mdast tree the UI renders. Raw HTML is already
 * flattened to text, and code spans/fences are `inlineCode`/`code` nodes, so
 * nothing inside them can be mistaken for live Markdown.
 */
export const parseRenderedMarkdown = (markdown: string): Root =>
  mdastPipeline.runSync(mdastPipeline.parse(markdown)) as Root;

/** Serialize an mdast tree back to Markdown. */
export const stringifyMarkdown = (children: RootContent[]): string =>
  markdownStringifier.stringify({ children, type: "root" } as Root).trim();
