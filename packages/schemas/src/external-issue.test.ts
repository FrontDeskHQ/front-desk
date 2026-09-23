import { describe, expect, it } from "vitest";

import { formatExternalEntityLabel } from "./external-issue";

describe(formatExternalEntityLabel, () => {
  it("formats repository entities with their container", () => {
    expect(
      formatExternalEntityLabel({
        containerKind: "repository",
        containerLabel: "frontdesk/app",
        shortId: "42",
      })
    ).toBe("frontdesk/app#42");
  });

  it("formats team-owned entities by their provider reference", () => {
    expect(
      formatExternalEntityLabel({
        containerKind: "team",
        containerLabel: "Engineering",
        shortId: "ENG-456",
      })
    ).toBe("ENG-456");
  });

  it("does not use a legacy repository number for a team-owned entity", () => {
    expect(
      formatExternalEntityLabel({
        containerKind: "team",
        containerLabel: "Engineering",
        number: 42,
      })
    ).toBe("");
  });

  it("falls back to legacy GitHub fields during migration", () => {
    expect(
      formatExternalEntityLabel({ number: 42, repoFullName: "frontdesk/app" })
    ).toBe("frontdesk/app#42");
  });

  it("does not append a separator when an entity has no short ID", () => {
    expect(
      formatExternalEntityLabel({
        containerKind: "repository",
        containerLabel: "frontdesk/app",
      })
    ).toBe("frontdesk/app");
  });
});
