import { describe, expect, it, vi } from "vitest";

const reflag = vi.hoisted(() => ({
  initialize: vi.fn<() => Promise<void>>(),
}));

vi.mock(import("@reflag/node-sdk"), () => ({
  ReflagClient: class {
    initialize = reflag.initialize;
  },
}));

import { initializeFeatureFlags } from "./feature-flag";

describe(initializeFeatureFlags, () => {
  it("waits for the Reflag client to finish initializing", async () => {
    let finishInitialization: (() => void) | undefined;
    reflag.initialize.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishInitialization = resolve;
        })
    );

    let ready = false;
    const startup = initializeFeatureFlags().then(() => {
      ready = true;
    });

    await Promise.resolve();
    expect(reflag.initialize).toHaveBeenCalledOnce();
    expect(ready).toBeFalsy();

    finishInitialization?.();
    await startup;

    expect(ready).toBeTruthy();
  });
});
