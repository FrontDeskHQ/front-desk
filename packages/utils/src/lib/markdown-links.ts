import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const markdownParser = unified().use(remarkParse).use(remarkGfm);

const htmlCodeTagPattern = /<\/?(pre|code)\b[^>]*>/gi;

interface HtmlCodeTag {
  offset: number;
  value: string;
}

const isInsideHtmlCodeElement = (
  htmlCodeTags: HtmlCodeTag[],
  offset: number
): boolean => {
  let depth = 0;

  for (const tag of htmlCodeTags) {
    if (tag.offset >= offset) {
      break;
    }

    if (tag.value.startsWith("</")) {
      depth = Math.max(0, depth - 1);
    } else if (!tag.value.trimEnd().endsWith("/>")) {
      depth += 1;
    }
  }

  return depth > 0;
};

const collectLinkUrls = (
  node: unknown,
  markdown: string,
  htmlCodeTags: HtmlCodeTag[],
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
    markdown[startOffset] === "[" &&
    !isInsideHtmlCodeElement(htmlCodeTags, startOffset)
  ) {
    urls.push(record.url);
  }

  if (Array.isArray(record.children)) {
    for (const child of record.children) {
      collectLinkUrls(child, markdown, htmlCodeTags, urls);
    }
  }
};

const collectHtmlCodeTags = (node: unknown, tags: HtmlCodeTag[]): void => {
  if (!node || typeof node !== "object") {
    return;
  }

  const record = node as {
    children?: unknown;
    position?: { start?: { offset?: unknown } };
    type?: unknown;
    value?: unknown;
  };
  const startOffset = record.position?.start?.offset;
  if (
    record.type === "html" &&
    typeof record.value === "string" &&
    typeof startOffset === "number"
  ) {
    for (const match of record.value.matchAll(htmlCodeTagPattern)) {
      tags.push({
        offset: startOffset + (match.index ?? 0),
        value: match[0],
      });
    }
  }

  if (Array.isArray(record.children)) {
    for (const child of record.children) {
      collectHtmlCodeTags(child, tags);
    }
  }
};

/** Extract explicit Markdown-link URLs outside raw HTML code elements. */
export const extractRenderedMarkdownLinkUrls = (markdown: string): string[] => {
  const urls: string[] = [];
  const tree = markdownParser.parse(markdown);
  const htmlCodeTags: HtmlCodeTag[] = [];
  collectHtmlCodeTags(tree, htmlCodeTags);
  htmlCodeTags.sort((a, b) => a.offset - b.offset);
  collectLinkUrls(tree, markdown, htmlCodeTags, urls);
  return urls;
};
