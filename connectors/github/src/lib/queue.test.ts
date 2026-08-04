import { describe, expect, it } from "vitest";

import { buildPrMatchJobId, buildRepoBackfillJobId } from "./queue";

describe("GitHub developer-action queue keys", () => {
  it("uses one stable PR key per organization and external entity", () => {
    const first = buildPrMatchJobId("org-a", "github:owner/repo#42");
    const repeated = buildPrMatchJobId("org-a", "github:owner/repo#42");
    const otherOrganization = buildPrMatchJobId(
      "org-b",
      "github:owner/repo#42"
    );

    expect(repeated).toBe(first);
    expect(otherOrganization).not.toBe(first);
  });

  it("uses one stable backfill key per organization and repository", () => {
    const first = buildRepoBackfillJobId("org-a", "owner/repo");
    const repeated = buildRepoBackfillJobId("org-a", "owner/repo");
    const otherRepository = buildRepoBackfillJobId("org-a", "owner/other");

    expect(repeated).toBe(first);
    expect(otherRepository).not.toBe(first);
  });
});
