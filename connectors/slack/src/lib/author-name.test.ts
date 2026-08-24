import { describe, expect, it } from "vitest";

import { slackAuthorName } from "./author-name";

describe("slackAuthorName", () => {
  it("prefers the Slack display name", () => {
    expect(
      slackAuthorName({
        name: "ada",
        profile: { display_name: "Ada L.", real_name: "Ada Lovelace" },
        real_name: "Ada Lovelace",
      })
    ).toBe("Ada L.");
  });

  it("falls back to real name when display name is unset", () => {
    expect(
      slackAuthorName({
        name: "ada",
        profile: { display_name: "", real_name: "Ada Lovelace" },
        real_name: "Ada Lovelace",
      })
    ).toBe("Ada Lovelace");
  });

  it("falls back to username, then Unknown", () => {
    expect(
      slackAuthorName({ name: "ada", profile: { display_name: "  " } })
    ).toBe("ada");
    expect(slackAuthorName({})).toBe("Unknown");
  });
});
