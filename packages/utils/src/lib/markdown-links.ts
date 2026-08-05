import type { Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

const markdownParser = unified().use(remarkParse).use(remarkGfm);
const markdownStringifier = unified().use(remarkStringify).use(remarkGfm);
const htmlTagPattern = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|<![^>]*>/g;

const parseStrippedHtmlNode = (value: string): RootContent[] => {
  const markdown = value.replace(htmlTagPattern, "");
  if (!markdown.trim()) {
    return [];
  }

  const parsed = markdownParser.parse(markdown) as Root;
  return stripHtmlNodes(parsed.children).nodes;
};

const stripHtmlNodes = (
  nodes: RootContent[]
): { hadHtml: boolean; nodes: RootContent[] } => {
  let hadHtml = false;
  const sanitizedNodes: RootContent[] = [];

  for (const node of nodes) {
    if (node.type === "html") {
      hadHtml = true;
      sanitizedNodes.push(...parseStrippedHtmlNode(node.value));
      continue;
    }

    if ("children" in node) {
      const sanitizedChildren = stripHtmlNodes(node.children as RootContent[]);
      hadHtml ||= sanitizedChildren.hadHtml;
      sanitizedNodes.push({
        ...node,
        children: sanitizedChildren.nodes,
      } as RootContent);
      continue;
    }

    sanitizedNodes.push(node);
  }

  return { hadHtml, nodes: sanitizedNodes };
};

/** Remove raw HTML nodes from agent-generated Markdown. */
export const stripHtmlTagsFromMarkdown = (markdown: string): string => {
  const tree = markdownParser.parse(markdown) as Root;
  const sanitized = stripHtmlNodes(tree.children);

  if (!sanitized.hadHtml) {
    return markdown;
  }

  return markdownStringifier
    .stringify({ ...tree, children: sanitized.nodes })
    .trim();
};

const collectLinkUrls = (
  node: unknown,
  markdown: string,
  urls: string[]
): void => {
  if (!node || typeof node !== "object") {
    return;
  }

  const record = node as {
    children?: unknown;
    position?: { start?: { offset?: unknown } };
    type?: unknown;
    url?: unknown;
  };
  const startOffset = record.position?.start?.offset;
  if (
    record.type === "link" &&
    typeof record.url === "string" &&
    typeof startOffset === "number" &&
    markdown[startOffset] === "["
  ) {
    urls.push(record.url);
  }

  if (Array.isArray(record.children)) {
    for (const child of record.children) {
      collectLinkUrls(child, markdown, urls);
    }
  }
};

/** Extract explicit Markdown-link URLs after raw HTML has been stripped. */
export const extractRenderedMarkdownLinkUrls = (markdown: string): string[] => {
  const urls: string[] = [];
  const sanitizedMarkdown = stripHtmlTagsFromMarkdown(markdown);
  const tree = markdownParser.parse(sanitizedMarkdown);
  collectLinkUrls(tree, sanitizedMarkdown, urls);
  return urls;
};
