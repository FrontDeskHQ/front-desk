import type { LiveStateFetchClient } from "@connectors/framework/runtime";
import { describe, expect, it, vi } from "vitest";

import { createCredentialStore } from "./credential-store";

describe(createCredentialStore, () => {
  it("does not start a core request after cancellation", async () => {
    const readCredential = vi.fn<() => Promise<null>>();
    const writeCredential =
      vi.fn<() => Promise<{ ok: boolean; version: number }>>();
    const store = createCredentialStore({
      mutate: { integration: { readCredential, writeCredential } },
    } as unknown as LiveStateFetchClient);
    const signal = AbortSignal.abort(new Error("cancelled"));

    await expect(store.read("integration-1", { signal })).rejects.toThrow(
      "cancelled"
    );
    await expect(
      store.write("integration-1", {}, 1, { signal })
    ).rejects.toThrow("cancelled");

    expect(readCredential).not.toHaveBeenCalled();
    expect(writeCredential).not.toHaveBeenCalled();
  });
});
