import type { Action } from "@workspace/schemas/signals";
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

  it("discards a primary action set the fallback cannot describe", () => {
    expect(
      ensureVerifiedPrRecommendationLink(
        `Link [PR #482](${prUrl}) and close the thread.`,
        [...linkPrPrimary, { kind: "close" }],
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
