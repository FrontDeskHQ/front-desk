import { describe, expect, it } from "vitest";

import {
  collectVerifiedIssueSearchesFromToolSteps,
  filterActionSetToVerifiedCreateIssue,
  issueSearchQueryCoversAction,
} from "./link-issue-verification";

describe("create_issue verification", () => {
  const createIssue = {
    kind: "create_issue",
    title: "Widget returns internal server error after API key rotation",
    body: "Rotating the API key causes the widget to return an internal server error.",
  };

  it("keeps creation after a relevant successful search with no candidates", () => {
    const searches = collectVerifiedIssueSearchesFromToolSteps([
      {
        toolResults: [
          {
            input: { query: "widget internal server error" },
            output: { hits: [], status: "ok" },
            toolName: "search_issues",
          },
        ],
      },
    ]);

    expect(
      filterActionSetToVerifiedCreateIssue(
        [createIssue],
        [],
        searches,
        new Set()
      ).primary
    ).toStrictEqual([createIssue]);
  });

  it("rejects a backend failure disguised as an empty result", () => {
    const searches = collectVerifiedIssueSearchesFromToolSteps([
      {
        toolResults: [
          {
            input: { query: "widget internal server error" },
            output: { hits: [], status: "unavailable" },
            toolName: "search_issues",
          },
        ],
      },
    ]);

    expect(searches).toStrictEqual([]);
    expect(
      filterActionSetToVerifiedCreateIssue(
        [createIssue],
        [],
        searches,
        new Set()
      ).primary
    ).toStrictEqual([]);
  });

  it("discards the action set when search is absent or unrelated", () => {
    expect(
      filterActionSetToVerifiedCreateIssue(
        [createIssue],
        [],
        [{ candidateUrls: [], query: "billing invoice" }],
        new Set()
      )
    ).toStrictEqual({ alternatives: [], primary: [] });
  });

  it("treats concrete symptom words and numeric error codes as relevant", () => {
    expect(
      issueSearchQueryCoversAction("API key rotation 401 failure", {
        body: "Requests return 401 while a rotated API key propagates.",
        title: "API key rotation causes authentication failure",
      })
    ).toBe(true);
  });

  it("requires every returned candidate to be read", () => {
    const candidateUrl = "https://github.com/acme/app/issues/42";
    const searches = [
      {
        candidateUrls: [candidateUrl],
        query: "widget internal server error",
      },
    ];

    expect(
      filterActionSetToVerifiedCreateIssue(
        [createIssue],
        [],
        searches,
        new Set()
      ).primary
    ).toStrictEqual([]);
    expect(
      filterActionSetToVerifiedCreateIssue(
        [createIssue],
        [],
        searches,
        new Set([candidateUrl])
      ).primary
    ).toStrictEqual([createIssue]);
  });
});
