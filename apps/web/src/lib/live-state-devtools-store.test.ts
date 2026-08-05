import type { ClientEvents } from "@live-state/sync/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLiveStateDevtoolsStore } from "./live-state-devtools-store";

describe("live-state devtools store collection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts and stops client collection with the final subscriber", () => {
    vi.stubGlobal("window", {});

    let listener: ((event: ClientEvents) => void) | undefined;
    const removeListener = vi.fn<() => void>();
    const addEventListener = vi.fn<
      (nextListener: (event: ClientEvents) => void) => () => void
    >((nextListener: (event: ClientEvents) => void) => {
      listener = nextListener;
      return removeListener;
    });
    const store = createLiveStateDevtoolsStore({ addEventListener });

    expect(addEventListener).not.toHaveBeenCalled();

    const unsubscribeMetrics = store.subscribeMetrics(() => {});
    expect(addEventListener).toHaveBeenCalledOnce();
    expect(listener).toBeDefined();

    const unsubscribeEvents = store.subscribeEvents(() => {});
    unsubscribeMetrics();
    expect(removeListener).not.toHaveBeenCalled();

    unsubscribeEvents();
    expect(removeListener).toHaveBeenCalledOnce();
  });
});
