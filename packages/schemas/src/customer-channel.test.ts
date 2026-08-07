import { describe, expect, it } from "vitest";

import { customerChannelSchema } from "./customer-channel";

describe("customer channel", () => {
  it("accepts the four CLI conversation origins", () => {
    for (const channel of ["slack", "discord", "widget", "portal"]) {
      expect(customerChannelSchema.safeParse(channel).success).toBeTruthy();
    }
  });

  it("rejects unrelated connector names", () => {
    expect(customerChannelSchema.safeParse("github").success).toBeFalsy();
  });
});
