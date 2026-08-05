import type { Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

const markdownParser = unified().use(remarkParse).use(remarkGfm);
const markdownStringifier = unified().use(remarkStringify).use(remarkGfm);
const htmlTagPattern = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|<![^>]*>/g;
const codeOpenTagPattern = /<(code|pre)\b[^>]*>/i;
const codeCloseTagPattern = /<\/(code|pre)\s*>/i;

const parseStrippedHtmlNode = (value: string): RootContent[] => {
  const markdown = value.replace(htmlTagPattern, "");
  // Malformed markup (e.g. an unclosed `<!--`) strips to itself and would be
  // re-parsed as the same raw HTML node forever — drop it instead of recursing.
  if (markdown === value || !markdown.trim()) {
    return [];
  }

  const parsed = markdownParser.parse(markdown) as Root;
  return stripHtmlNodes(parsed.children, markdown).nodes;
};

// Node types whose children are phrasing content, where only `inlineCode` is valid.
const phrasingParents = new Set([
  "delete",
  "emphasis",
  "heading",
  "link",
  "linkReference",
  "paragraph",
  "strong",
  "tableCell",
]);

/** Build a code node so masked content keeps its literal, non-rendered text. */
const toCodeNode = (value: string, blockLevel: boolean): RootContent[] => {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  return blockLevel
    ? [{ lang: null, meta: null, type: "code", value: trimmed }]
    : [{ type: "inlineCode", value: trimmed.replace(/\s+/g, " ") }];
};

const sourceSliceOf = (nodes: RootContent[], source: string): string => {
  const start = nodes[0]?.position?.start?.offset;
  const end = nodes.at(-1)?.position?.end?.offset;
  if (typeof start !== "number" || typeof end !== "number") {
    return "";
  }
  return source.slice(start, end);
};

const stripHtmlNodes = (
  nodes: RootContent[],
  source: string,
  blockLevel = true
): { hadHtml: boolean; nodes: RootContent[] } => {
  let hadHtml = false;
  const sanitizedNodes: RootContent[] = [];

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (!node) {
      continue;
    }

    if (node.type === "html") {
      hadHtml = true;

      // Raw `<code>`/`<pre>` markup: mask the contents so a link written inside
      // it stays literal text instead of becoming a real Markdown link.
      const openTag = node.value.match(codeOpenTagPattern);
      if (openTag) {
        const afterOpen = node.value.slice(
          (openTag.index ?? 0) + openTag[0].length
        );
        if (codeCloseTagPattern.test(afterOpen)) {
          // Self-contained: the whole span lives inside this one html node.
          sanitizedNodes.push(
            ...toCodeNode(node.value.replace(htmlTagPattern, ""), blockLevel)
          );
          continue;
        }

        // The span continues across siblings until a closing tag (or the end).
        let end = index + 1;
        while (end < nodes.length) {
          const sibling = nodes[end];
          if (sibling?.type === "html" && codeCloseTagPattern.test(sibling.value)) {
            break;
          }
          end++;
        }
        const inner = nodes.slice(index + 1, end);
        sanitizedNodes.push(
          ...toCodeNode(
            `${afterOpen}${sourceSliceOf(inner, source)}`.replace(
              htmlTagPattern,
              ""
            ),
            blockLevel
          )
        );
        index = end;
        continue;
      }

      // A closing tag with no matching opener carries no content.
      if (codeCloseTagPattern.test(node.value)) {
        continue;
      }

      sanitizedNodes.push(...parseStrippedHtmlNode(node.value));
      continue;
    }

    if ("children" in node) {
      const sanitizedChildren = stripHtmlNodes(
        node.children as RootContent[],
        source,
        !phrasingParents.has(node.type)
      );
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
  const sanitized = stripHtmlNodes(tree.children, markdown);

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
