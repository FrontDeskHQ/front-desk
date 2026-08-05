import { describe, expect, it } from "vitest";

import {
  extractRenderedMarkdownLinkUrls,
  stripHtmlTagsFromMarkdown,
} from "./markdown-links";

const prUrl = "https://github.com/acme/api/pull/482";

describe("stripHtmlTagsFromMarkdown", () => {
  it("removes raw HTML tags while keeping their text", () => {
    expect(stripHtmlTagsFromMarkdown("<span>Recommendation</span>")).toBe(
      "Recommendation"
    );
  });

  // An unclosed comment is one raw HTML block that runs to the end of the
  // document, so nothing survives it — the point is that it does not throw.
  it("drops malformed markup instead of recursing forever", () => {
    expect(stripHtmlTagsFromMarkdown("<!-- unclosed\n\nRecommendation")).toBe(
      ""
    );
    expect(stripHtmlTagsFromMarkdown("Recommendation\n\n<!-- unclosed")).toBe(
      "Recommendation"
    );
  });

  it("masks raw HTML code markup so its contents stay literal", () => {
    expect(stripHtmlTagsFromMarkdown(`<code>[PR #482](${prUrl})</code>`)).toBe(
      `\`[PR #482](${prUrl})\``
    );
  });
});

describe("extractRenderedMarkdownLinkUrls", () => {
  it("returns explicit Markdown links", () => {
    expect(extractRenderedMarkdownLinkUrls(`[PR #482](${prUrl})`)).toStrictEqual(
      [prUrl]
    );
  });

  it("ignores links written inside raw HTML code markup", () => {
    expect(
      extractRenderedMarkdownLinkUrls(`<code>[PR #482](${prUrl})</code>`)
    ).toStrictEqual([]);
    expect(
      extractRenderedMarkdownLinkUrls(`<pre>\n[PR #482](${prUrl})\n</pre>`)
    ).toStrictEqual([]);
  });

  it("ignores links inside Markdown code spans and fences", () => {
    expect(
      extractRenderedMarkdownLinkUrls(`\`[PR #482](${prUrl})\``)
    ).toStrictEqual([]);
    expect(
      extractRenderedMarkdownLinkUrls(`\`\`\`\n[PR #482](${prUrl})\n\`\`\``)
    ).toStrictEqual([]);
  });

  it("still sees a link that follows non-code raw HTML", () => {
    expect(
      extractRenderedMarkdownLinkUrls(`<span>Link</span> [PR #482](${prUrl})`)
    ).toStrictEqual([prUrl]);
  });
});
