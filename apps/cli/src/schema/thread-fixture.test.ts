import { describe, expect, it } from "vitest";

import { threadFixtureSchema } from "./thread-fixture";

const baseFixture = {
  author: "Jordan Lee",
  message: "The export still fails after retrying.",
  title: "Export fails after retry",
};

describe("thread fixture", () => {
  it("defaults the channel to portal", () => {
    expect(threadFixtureSchema.parse(baseFixture).channel).toBe("portal");
  });

  it("accepts every supported channel", () => {
    for (const channel of ["slack", "discord", "widget", "portal"]) {
      expect(
        threadFixtureSchema.safeParse({ ...baseFixture, channel }).success
      ).toBeTruthy();
    }
  });

  it("rejects unsupported channels", () => {
    expect(
      threadFixtureSchema.safeParse({ ...baseFixture, channel: "email" })
        .success
    ).toBeFalsy();
  });
});
