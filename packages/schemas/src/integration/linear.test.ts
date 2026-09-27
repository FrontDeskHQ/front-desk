import { describe, expect, it } from "vitest";

import { linearIntegrationSchema } from "./linear";

const team = { id: "team-1", key: "ENG", name: "Engineering" };

describe("Linear integration config", () => {
  it("accepts a default team from the connected workspace", () => {
    expect(
      linearIntegrationSchema.safeParse({
        defaultTeamId: team.id,
        teams: [team],
      }).success
    ).toBeTruthy();
  });

  it("rejects empty and unknown default team ids", () => {
    expect(
      linearIntegrationSchema.safeParse({ defaultTeamId: "", teams: [team] })
        .success
    ).toBeFalsy();
    expect(
      linearIntegrationSchema.safeParse({
        defaultTeamId: "team-2",
        teams: [team],
      }).success
    ).toBeFalsy();
  });
});
