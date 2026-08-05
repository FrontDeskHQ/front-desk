import { describe, expect, it } from "vitest";

import { hasSynthesisTrigger } from "./trigger-policy";

describe(hasSynthesisTrigger, () => {
  it("forces synthesis for every non-supersede cause", () => {
    for (const kind of ["message", "pr_matched", "sla", "manual"] as const) {
      expect(hasSynthesisTrigger([{ kind }])).toBeTruthy();
    }
  });

  it("keeps supersede on the clear-read path", () => {
    expect(hasSynthesisTrigger([{ kind: "supersede" }])).toBeFalsy();
    expect(
      hasSynthesisTrigger([{ kind: "supersede" }, { kind: "message" }])
    ).toBeTruthy();
  });
});
