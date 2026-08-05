import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import {
  extractRenderedMarkdownLinkUrls,
  remarkMapLinkUrls,
  stripRenderedMarkdownLinks,
} from "./markdown-links";

const prUrl = "https://github.com/acme/api/pull/482";

describe(extractRenderedMarkdownLinkUrls, () => {
  it("returns explicit Markdown links", () => {
    expect(
      extractRenderedMarkdownLinkUrls(`[PR #482](${prUrl})`)
    ).toStrictEqual([prUrl]);
  });

  // The UI renders raw HTML as literal text, so `<code>` never makes the link
  // inside it into code — the link still renders, and we must agree.
  it("still sees a link wrapped in inline raw HTML, as the renderer does", () => {
    expect(
      extractRenderedMarkdownLinkUrls(`<code>[PR #482](${prUrl})</code>`)
    ).toStrictEqual([prUrl]);
  });

  it("ignores a link inside a raw HTML block, which renders as literal text", () => {
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
    // An unclosed fence runs to the end of the document in CommonMark, and the
    // renderer agrees, so the link below it is code — not a link.
    expect(
      extractRenderedMarkdownLinkUrls(`\`\`\`\nfoo\n\n[PR #482](${prUrl})`)
    ).toStrictEqual([]);
  });

  it("ignores bare URLs and images, which carry no anchor label", () => {
    expect(extractRenderedMarkdownLinkUrls(`See ${prUrl}`)).toStrictEqual([]);
    expect(
      extractRenderedMarkdownLinkUrls(`![PR #482](${prUrl})`)
    ).toStrictEqual([]);
  });
});

describe(stripRenderedMarkdownLinks, () => {
  it("removes explicit links and keeps the surrounding prose", () => {
    expect(
      stripRenderedMarkdownLinks(`Link [PR #482](${prUrl}) to the thread.`)
    ).toBe("Link  to the thread.");
  });

  it("leaves link-looking text inside code alone", () => {
    const markdown = `Use \`[PR #482](${prUrl})\` verbatim.`;
    expect(stripRenderedMarkdownLinks(markdown)).toBe(markdown);
  });
});

describe(remarkMapLinkUrls, () => {
  const toProxy = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(
      remarkMapLinkUrls((url) =>
        url.startsWith("thread:") ? `https://proxy/${url.slice(7)}` : null
      )
    )
    .use(remarkStringify);
  const run = (markdown: string) =>
    String(toProxy.processSync(markdown)).trim();

  it("rewrites matching link destinations", () => {
    expect(run("See [Billing bug](thread:abc123) for context.")).toBe(
      "See [Billing bug](https://proxy/abc123) for context."
    );
  });

  it("leaves non-matching links untouched", () => {
    expect(run(`See [PR #482](${prUrl}).`)).toBe(`See [PR #482](${prUrl}).`);
  });

  // The old source-level regex rewrote any `(thread:id)` it found, including
  // inside code samples and ordinary prose that was never a link.
  it("does not rewrite code or prose that merely looks like a link", () => {
    expect(run("Call `(thread:abc123)` directly.")).toBe(
      "Call `(thread:abc123)` directly."
    );
    expect(run("```\n(thread:abc123)\n```")).toBe("```\n(thread:abc123)\n```");
    expect(run("Mentioned in passing (thread:abc123) here.")).toBe(
      "Mentioned in passing (thread:abc123) here."
    );
  });
});
