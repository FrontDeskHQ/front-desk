import type { CapabilityEntityRef } from "@connectors/framework";
import { describe, expect, it } from "vitest";

import {
  normalizeGitHubIssueOutcome,
  normalizeGitHubPullRequestOutcome,
} from "./outcome";

const entity: CapabilityEntityRef = {
  externalKey: "github:acme/app#1",
  number: 1,
  repoFullName: "acme/app",
  url: "https://github.com/acme/app/issues/1",
};

const issue = (stateReason: "COMPLETED" | "NOT_PLANNED" | "DUPLICATE") => ({
  body: "Details",
  databaseId: 1,
  number: 1,
  repository: { nameWithOwner: "acme/app" },
  state: "CLOSED" as const,
  stateReason,
  title: "Issue",
  url: entity.url,
});

describe("GitHub external outcomes", () => {
  it("maps completed and not-planned issues without reading comments", () => {
    expect(normalizeGitHubIssueOutcome(issue("COMPLETED"), entity).outcome).toBe(
      "delivered"
    );
    expect(
      normalizeGitHubIssueOutcome(issue("NOT_PLANNED"), entity).outcome
    ).toBe("declined");
  });

  it("returns GitHub's structured canonical issue for a duplicate", () => {
    const result = normalizeGitHubIssueOutcome(
      {
        ...issue("DUPLICATE"),
        duplicateOf: {
          ...issue("COMPLETED"),
          databaseId: 9,
          number: 9,
          title: "Canonical issue",
          url: "https://github.com/acme/app/issues/9",
        },
      },
      entity
    );

    expect(result.outcome).toBe("superseded");
    expect(result.successor?.entity.number).toBe(9);
    expect(result.successor?.outcome).toBe("delivered");
  });

  it("distinguishes a merged PR from a closed-unmerged PR", () => {
    const base = {
      body: null,
      number: 1,
      repository: { nameWithOwner: "acme/app" },
      state: "CLOSED" as const,
      title: "PR",
      url: "https://github.com/acme/app/pull/1",
    };
    expect(
      normalizeGitHubPullRequestOutcome({ ...base, merged: true }, entity)
    ).toMatchObject({ finished: true, outcome: "delivered" });
    expect(
      normalizeGitHubPullRequestOutcome({ ...base, merged: false }, entity)
    ).toMatchObject({ finished: false, outcome: "unknown" });
  });
});
