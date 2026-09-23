import { describe, expect, it } from "vitest";

import { resolveGitHubEntityReference } from "./entity-reference";

describe(resolveGitHubEntityReference, () => {
  it("resolves a valid legacy repository reference", () => {
    expect(
      resolveGitHubEntityReference({
        externalRef: {},
        number: 42,
        repoFullName: "frontdesk/app",
      })
    ).toStrictEqual({ number: 42, owner: "frontdesk", repo: "app" });
  });

  it.each([0, -1, 1.5])(
    "rejects an invalid legacy entity number (%s)",
    (number) => {
      expect(
        resolveGitHubEntityReference({
          externalRef: {},
          number,
          repoFullName: "frontdesk/app",
        })
      ).toBeNull();
    }
  );
});
