import { describe, expect, it, vi } from "vitest";

import { guardWidgetSubscription } from "./widget-subscription";

const identity = {
  keyVersion: 2,
  name: "Ada",
  organizationId: "org-a",
  userId: "customer-1",
};

describe("widget subscription authorization", () => {
  it("forwards updates while the signing key remains active", async () => {
    const forward = vi.fn<(value: { id: string }) => void>();
    const guarded = guardWidgetSubscription(
      identity,
      forward,
      async () => true
    );

    guarded({ id: "delta-1" });
    await vi.waitFor(() =>
      expect(forward).toHaveBeenCalledWith({ id: "delta-1" })
    );
  });

  it("drops updates after an established socket's key is revoked", async () => {
    const forward = vi.fn<(value: { id: string }) => void>();
    const isActive = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    const guarded = guardWidgetSubscription(
      identity,
      forward,
      isActive
    );

    guarded({ id: "public-delta" });
    await vi.waitFor(() =>
      expect(forward).toHaveBeenCalledWith({ id: "public-delta" })
    );
    guarded({ id: "private-delta" });
    await vi.waitFor(() => expect(isActive).toHaveBeenCalledTimes(2));
    expect(forward).not.toHaveBeenCalledWith({ id: "private-delta" });
  });

  it("revalidates updates that arrive while a check is in flight", async () => {
    const forward = vi.fn<(value: { id: string }) => void>();
    let finish: ((active: boolean) => void) | undefined;
    const isActive = vi
      .fn<() => Promise<boolean>>()
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            finish = resolve;
          })
      )
      .mockResolvedValue(false);
    const guarded = guardWidgetSubscription(identity, forward, isActive);

    guarded({ id: "delta-1" });
    guarded({ id: "delta-2" });
    expect(isActive).toHaveBeenCalledTimes(1);

    finish?.(true);
    await vi.waitFor(() => expect(isActive).toHaveBeenCalledTimes(2));
    expect(forward).toHaveBeenCalledWith({ id: "delta-1" });
    expect(forward).not.toHaveBeenCalledWith({ id: "delta-2" });
  });

  it("bounds updates waiting behind a slow revalidation", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const forward = vi.fn<(value: { id: string }) => void>();
    const guarded = guardWidgetSubscription(
      identity,
      forward,
      () => new Promise<boolean>(() => {})
    );

    for (let index = 0; index < 102; index += 1) {
      guarded({ id: `delta-${index}` });
    }

    expect(warning).toHaveBeenCalledWith(
      "[auth] Widget subscription update buffer is full"
    );
    warning.mockRestore();
  });
});
