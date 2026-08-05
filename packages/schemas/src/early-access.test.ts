import { describe, expect, it } from "vitest";

import { earlyAccessRequestSchema } from "./early-access";

const requestWithEmail = (email: string) => ({
  autonomy: "routine_autonomous" as const,
  channels: ["slack" as const],
  email,
  volume: "under_10" as const,
});

describe("early-access request schema", () => {
  it("limits email addresses to 254 characters", () => {
    const atLimit = `${"a".repeat(242)}@example.com`;
    const overLimit = `${"a".repeat(243)}@example.com`;

    expect(
      earlyAccessRequestSchema.safeParse(requestWithEmail(atLimit)).success
    ).toBeTruthy();
    expect(
      earlyAccessRequestSchema.safeParse(requestWithEmail(overLimit)).success
    ).toBeFalsy();
  });
});
