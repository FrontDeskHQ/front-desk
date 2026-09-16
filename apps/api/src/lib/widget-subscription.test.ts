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
    const guarded = guardWidgetSubscription(
      identity,
      forward,
      async () => false
    );

    guarded({ id: "private-delta" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(forward).not.toHaveBeenCalled();
  });
});
