import { safeParseJSON } from "@connectors/framework/runtime";
import { parse } from "@workspace/utils/md-tiptap";
import { stringify } from "@workspace/utils/tiptap-md";
import { describe, expect, it } from "vitest";

import {
  formatSlackOutboundText,
  markdownToSlackMrkdwn,
} from "./markdown-to-mrkdwn";

const widgetDocsUrl = "https://tryfrontdesk.app/docs/integrations/widget";
const widgetDocsMarkdown = `[Widget docs](${widgetDocsUrl})`;

describe(markdownToSlackMrkdwn, () => {
  it("converts a CommonMark link into Slack mrkdwn", () => {
    expect(markdownToSlackMrkdwn(widgetDocsMarkdown)).toBe(
      `<${widgetDocsUrl}|Widget docs>`
    );
  });

  it("keeps surrounding prose and converts every explicit link", () => {
    expect(
      markdownToSlackMrkdwn(
        `See ${widgetDocsMarkdown} or [Pricing](https://example.com/pricing).`
      )
    ).toBe(
      `See <${widgetDocsUrl}|Widget docs> or <https://example.com/pricing|Pricing>.`
    );
  });

  it("leaves link-looking text inside code alone", () => {
    const inline = `Use \`${widgetDocsMarkdown}\` verbatim.`;
    expect(markdownToSlackMrkdwn(inline)).toBe(inline);

    expect(markdownToSlackMrkdwn(`\`\`\`\n${widgetDocsMarkdown}\n\`\`\``)).toBe(
      `\`\`\`\n${widgetDocsMarkdown}\n\`\`\``
    );
  });

  it("sanitizes pipe characters in the link label", () => {
    expect(markdownToSlackMrkdwn("[A | B](https://example.com)")).toBe(
      "<https://example.com|A - B>"
    );
  });
});

describe(formatSlackOutboundText, () => {
  it("posts stored Tiptap content with Slack-formatted links", () => {
    const stored = JSON.stringify(parse(widgetDocsMarkdown));

    expect(
      stringify(safeParseJSON(stored), {
        heading: true,
        horizontalRule: true,
      })
    ).toContain(widgetDocsMarkdown);

    expect(formatSlackOutboundText(stored).trim()).toBe(
      `<${widgetDocsUrl}|Widget docs>`
    );
  });
});
