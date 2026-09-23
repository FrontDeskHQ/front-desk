import { describe, expect, it } from "vitest";

import { buildIssueFields, buildPullRequestFields } from "./external-entity";
import type { RepoRef } from "./external-entity";

const repo: RepoRef = {
  fullName: "frontdesk/app",
  name: "app",
  owner: "frontdesk",
};

describe("GitHub external-entity addressing", () => {
  it("dual-writes neutral and legacy issue fields", () => {
    const fields = buildIssueFields(
      {
        assignees: [],
        body: "Body",
        closed_at: null,
        created_at: "2026-09-20T00:00:00.000Z",
        html_url: "https://github.com/frontdesk/app/issues/42",
        id: 4200,
        labels: [],
        number: 42,
        state: "open",
        title: "Issue",
        updated_at: "2026-09-21T00:00:00.000Z",
        user: { login: "octocat" },
      },
      repo
    );

    expect(fields).toMatchObject({
      containerId: "frontdesk/app",
      containerKind: "repository",
      containerLabel: "frontdesk/app",
      externalKey: "github:frontdesk/app#4200",
      externalRef: { number: 42, owner: "frontdesk", repo: "app" },
      number: 42,
      provider: "github",
      repoFullName: "frontdesk/app",
      shortId: "42",
    });
  });

  it("dual-writes neutral and legacy pull-request fields", () => {
    const fields = buildPullRequestFields(
      {
        assignees: [],
        base: { ref: "main" },
        body: "Body",
        closed_at: null,
        created_at: "2026-09-20T00:00:00.000Z",
        draft: false,
        head: { ref: "fix/export" },
        html_url: "https://github.com/frontdesk/app/pull/43",
        id: 4300,
        labels: [],
        merged_at: null,
        number: 43,
        state: "open",
        title: "Fix export",
        updated_at: "2026-09-21T00:00:00.000Z",
        user: { login: "octocat" },
      },
      repo
    );

    expect(fields).toMatchObject({
      containerId: "frontdesk/app",
      containerKind: "repository",
      containerLabel: "frontdesk/app",
      externalKey: "github:frontdesk/app#4300",
      externalRef: { number: 43, owner: "frontdesk", repo: "app" },
      number: 43,
      provider: "github",
      repoFullName: "frontdesk/app",
      shortId: "43",
    });
  });
});
