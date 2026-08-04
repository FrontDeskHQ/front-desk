import { describe, expect, it } from "vitest";

import {
  buildRepositoryBackfillPayload,
  getEligibleDeveloperPullRequests,
  toggleRepositorySelection,
} from "./github-selection";

describe("developer GitHub selection", () => {
  it("keeps only open, non-draft mirrored pull requests in stable order", () => {
    const eligible = getEligibleDeveloperPullRequests([
      {
        draft: false,
        id: "repo-b-2",
        number: 2,
        repoFullName: "owner/beta",
        state: "open",
      },
      {
        draft: true,
        id: "repo-a-1",
        number: 1,
        repoFullName: "owner/alpha",
        state: "open",
      },
      {
        draft: false,
        id: "repo-a-3",
        number: 3,
        repoFullName: "owner/alpha",
        state: "open",
      },
      {
        draft: false,
        id: "repo-a-4",
        number: 4,
        repoFullName: "owner/alpha",
        state: "closed",
      },
    ]);

    expect(eligible.map(({ id }) => id)).toStrictEqual([
      "repo-a-3",
      "repo-b-2",
    ]);
  });

  it("toggles repository selection without allowing duplicate entries", () => {
    expect(
      toggleRepositorySelection(["owner/alpha"], "owner/beta")
    ).toStrictEqual(["owner/alpha", "owner/beta"]);
    expect(
      toggleRepositorySelection(["owner/alpha", "owner/beta"], "owner/alpha")
    ).toStrictEqual(["owner/beta"]);
    expect(
      toggleRepositorySelection(["owner/alpha"], "owner/alpha")
    ).toStrictEqual([]);
  });

  it("keeps selected backfills explicit and represents all as a separate choice", () => {
    expect(
      buildRepositoryBackfillPayload({
        allRepositories: false,
        selectedRepositories: ["owner/beta", "owner/alpha", "owner/beta"],
      })
    ).toStrictEqual({
      allRepositories: false,
      repositories: ["owner/alpha", "owner/beta"],
    });
    expect(
      buildRepositoryBackfillPayload({
        allRepositories: true,
        selectedRepositories: ["owner/alpha"],
      })
    ).toStrictEqual({ allRepositories: true });
  });
});
