import { safeParseJSON } from "@connectors/framework/runtime";
import { remarkHtmlAsText } from "@workspace/utils/markdown-render";
import { stringify } from "@workspace/utils/tiptap-md";
import type { Link } from "mdast";
import type { Handle } from "mdast-util-to-markdown";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

/**
 * Slack mrkdwn treats `|` as the label delimiter inside `<url|label>`, so a
 * literal pipe in display text would truncate the link.
 */
export const sanitizeSlackLinkLabel = (label: string): string =>
  label
    .replaceAll(/&/g, "&amp;")
    .replaceAll(/</g, "&lt;")
    .replaceAll(/>/g, "&gt;")
    .replaceAll(/\|/g, "-");

const slackLink: Handle = (node: Link, _parent, state, info) => {
  const label = sanitizeSlackLinkLabel(
    state.containerPhrasing(node, info) || node.url
  );
  return `<${node.url}|${label}>`;
};

const toSlackMrkdwn = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkHtmlAsText)
  .use(remarkStringify, { handlers: { link: slackLink } });

/**
 * Slack `text` is mrkdwn, not CommonMark: `[label](url)` stays literal.
 * Re-serialize with remark so only real link nodes become `<url|label>` —
 * code spans, fences, and link-looking prose are left alone.
 */
export const markdownToSlackMrkdwn = (markdown: string): string =>
  String(toSlackMrkdwn.processSync(markdown)).trimEnd();

export const formatSlackOutboundText = (content: string): string =>
  markdownToSlackMrkdwn(
    stringify(safeParseJSON(content), {
      heading: true,
      horizontalRule: true,
    })
  );
