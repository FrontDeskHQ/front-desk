import { describe, expect, it } from "vitest";

import { hasSynthesisTrigger } from "./trigger-policy";

describe("synthesis trigger policy", () => {
  it("runs for any non-supersede trigger", () => {
    expect(hasSynthesisTrigger([{ kind: "pr_matched" }])).toBeTruthy();
    expect(hasSynthesisTrigger([{ kind: "manual" }])).toBeTruthy();
    expect(hasSynthesisTrigger([{ kind: "message" }])).toBeTruthy();
  });

  it("does not run synthesis for a supersede-only cause", () => {
    expect(hasSynthesisTrigger([{ kind: "supersede" }])).toBeFalsy();
  });

  it("runs when a supersede is accompanied by another cause", () => {
    expect(
      hasSynthesisTrigger([{ kind: "supersede" }, { kind: "sla" }])
    ).toBeTruthy();
  });
});
