import type { Action } from "@workspace/schemas/signals";
import { STATUS_RESOLVED } from "@workspace/schemas/signals";
import { describe, expect, it } from "vitest";

import {
  collectVerifiedPrDetailsFromToolSteps,
  ensureVerifiedPrRecommendationLink,
} from "./link-pr-verification";

const prUrl = "https://github.com/acme/api/pull/482";

const verifiedPrs = collectVerifiedPrDetailsFromToolSteps([
  {
    toolResults: [
      {
        output: {
          found: true,
          pr: { number: 482, url: prUrl },
        },
        toolName: "read_pr",
      },
    ],
  },
]);

const linkPrPrimary: Action[] = [
  { kind: "link_pr", prUrl },
  { kind: "reply", draftMarkdown: "Hi there," },
];

describe("verified PR recommendation links", () => {
  it("repairs a missing PR Markdown link with the verified URL", () => {
    expect(
      ensureVerifiedPrRecommendationLink(
        "Link the pull request that fixes this and let the customer know.",
        linkPrPrimary,
        verifiedPrs
      )
    ).toBe(
      `Link [PR #482](${prUrl}) to the thread and reply to tell the customer that engineering is working on the fix.`
    );
  });

  it("leaves a recommendation with the exact verified link unchanged", () => {
    const recommendation = `Link [PR #482](${prUrl}) to the thread.`;
    expect(
      ensureVerifiedPrRecommendationLink(
        recommendation,
        linkPrPrimary,
        verifiedPrs
      )
    ).toBe(recommendation);
  });

  it("repairs a malformed URL suffix without a Markdown label", () => {
    expect(
      ensureVerifiedPrRecommendationLink(
        `Link ](${prUrl}) to the thread.`,
        linkPrPrimary,
        verifiedPrs
      )
    ).toBe(
      `Link [PR #482](${prUrl}) to the thread and reply to tell the customer that engineering is working on the fix.`
    );
  });

  it("repairs recommendations that include an unverified Markdown link", () => {
    const otherPrUrl = "https://github.com/acme/api/pull/999";
    expect(
      ensureVerifiedPrRecommendationLink(
        `Link [PR #482](${prUrl}) and [another PR](${otherPrUrl}) to the thread.`,
        linkPrPrimary,
        verifiedPrs
      )
    ).toBe(
      `Link [PR #482](${prUrl}) to the thread and reply to tell the customer that engineering is working on the fix.`
    );
  });

  it.each([
    `![PR #482](${prUrl})`,
    `\`[PR #482](${prUrl})\``,
    `~~~markdown\n[PR #482](${prUrl})\n~~~`,
    `    [PR #482](${prUrl})`,
  ])(
    "repairs a verified URL used outside an anchor link: %s",
    (recommendation) => {
      expect(
        ensureVerifiedPrRecommendationLink(
          recommendation,
          linkPrPrimary,
          verifiedPrs
        )
      ).toBe(
        `Link [PR #482](${prUrl}) to the thread and reply to tell the customer that engineering is working on the fix.`
      );
    }
  );

  it("repairs a bare verified PR URL when explicit link syntax is required", () => {
    const recommendation = `Link ${prUrl} to the thread.`;
    expect(
      ensureVerifiedPrRecommendationLink(
        recommendation,
        linkPrPrimary,
        verifiedPrs
      )
    ).toBe(
      `Link [PR #482](${prUrl}) to the thread and reply to tell the customer that engineering is working on the fix.`
    );
  });

  // The UI renders raw HTML as literal text rather than parsing it, so inline
  // tags around a link do not stop that link from rendering. Validation must
  // match the renderer: accept it rather than swapping in the fallback.
  it.each([
    `<code>[PR #482](${prUrl})</code>`,
    `Link <code>[PR #482](${prUrl})</code> to the thread.`,
    `<span>Link</span> [PR #482](${prUrl}) to the thread.`,
  ])(
    "accepts a verified link alongside inline raw HTML: %s",
    (recommendation) => {
      expect(
        ensureVerifiedPrRecommendationLink(
          recommendation,
          linkPrPrimary,
          verifiedPrs
        )
      ).toBe(recommendation);
    }
  );

  // A raw HTML *block* is one literal text node, so the link never renders.
  it("repairs a verified URL buried in a raw HTML block", () => {
    expect(
      ensureVerifiedPrRecommendationLink(
        `<pre>\n[PR #482](${prUrl})\n</pre>`,
        linkPrPrimary,
        verifiedPrs
      )
    ).toBe(
      `Link [PR #482](${prUrl}) to the thread and reply to tell the customer that engineering is working on the fix.`
    );
  });

  // Since ADR 0014 `[link_pr, set_status, reply]` is a normal bundle, so a
  // third action is not by itself grounds to discard: the recommendation the
  // model wrote already names the verified PR, and nothing is being hidden.
  it("keeps a bundled set whose recommendation already names the verified PR", () => {
    const recommendation = `Link [PR #482](${prUrl}) and resolve the thread.`;
    expect(
      ensureVerifiedPrRecommendationLink(
        recommendation,
        [...linkPrPrimary, { kind: "set_status", status: STATUS_RESOLVED }],
        verifiedPrs
      )
    ).toBe(recommendation);
  });

  it("discards a primary action set the fallback cannot describe", () => {
    // No usable link, so a fallback is required — and the fallback sentence can
    // only mention link_pr and reply, which would hide the status change.
    expect(
      ensureVerifiedPrRecommendationLink(
        "Link the pull request and close the thread.",
        [...linkPrPrimary, { kind: "set_status", status: STATUS_RESOLVED }],
        verifiedPrs
      )
    ).toBeNull();
  });

  it("does not add a PR link when link_pr is not primary", () => {
    const recommendation = "Reply with an update for the customer.";
    expect(
      ensureVerifiedPrRecommendationLink(
        recommendation,
        [{ kind: "reply", draftMarkdown: "Hi there," }],
        verifiedPrs
      )
    ).toBe(recommendation);
  });
});
