import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("octokit", () => ({ App: class App {} }));

import {
  githubIssueLikeSchema,
  githubPullRequestLikeSchema,
  issueOutcomeNodeSchema,
  pullRequestOutcomeNodeSchema,
} from "./github";

describe("GitHub response validation", () => {
  it("rejects a malformed issue response", () => {
    expect(
      githubIssueLikeSchema.safeParse({
        created_at: "2026-01-01T00:00:00Z",
        html_url: "https://github.com/acme/app/issues/1",
        id: 1,
        number: 1,
        title: "Missing updated_at",
      }).success
    ).toBe(false);
  });

  it("rejects a malformed pull request response", () => {
    expect(
      githubPullRequestLikeSchema.safeParse({
        base: { ref: "main" },
        created_at: "2026-01-01T00:00:00Z",
        head: {},
        html_url: "https://github.com/acme/app/pull/1",
        id: 1,
        number: 1,
        state: "open",
        title: "Missing head ref",
        updated_at: "2026-01-01T00:00:00Z",
      }).success
    ).toBe(false);
  });

  it("rejects malformed GraphQL outcome nodes", () => {
    expect(
      issueOutcomeNodeSchema.safeParse({
        body: null,
        databaseId: 1,
        number: 1,
        repository: { nameWithOwner: "acme/app" },
        state: "BROKEN",
        stateReason: null,
        title: "Invalid state",
        url: "https://github.com/acme/app/issues/1",
      }).success
    ).toBe(false);
    expect(
      pullRequestOutcomeNodeSchema.safeParse({
        body: null,
        merged: "yes",
        number: 1,
        repository: { nameWithOwner: "acme/app" },
        state: "MERGED",
        title: "Invalid merged flag",
        url: "https://github.com/acme/app/pull/1",
      }).success
    ).toBe(false);
  });
});
