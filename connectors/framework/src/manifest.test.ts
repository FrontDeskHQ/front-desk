import { describe, expect, it } from "vitest";

import { CAPABILITY_INVOKE_PATH } from "./invoke";
import { linearManifest } from "./manifest";
import { buildRegistry } from "./registry";

describe("Linear connector registration", () => {
  it("discovers Linear through the issue-tracker capability", () => {
    const registry = buildRegistry([linearManifest], {});

    expect(registry.providersOf("issue-tracker")).toHaveLength(1);
    expect(registry.getByType("linear")?.invokeUrl).toBe(
      `http://localhost:3336/linear${CAPABILITY_INVOKE_PATH}`
    );
  });
});
