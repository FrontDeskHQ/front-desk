import { afterEach, describe, expect, it, vi } from "vitest";

import { formatRelativeTime, parseLiveTimestamp } from "./format";

describe(parseLiveTimestamp, () => {
  it("treats postgres JSON timestamps with no offset as UTC", () => {
    expect(parseLiveTimestamp("2026-08-26T21:42:00").toISOString()).toBe(
      "2026-08-26T21:42:00.000Z"
    );
    expect(parseLiveTimestamp("2026-08-26 21:42:00").toISOString()).toBe(
      "2026-08-26T21:42:00.000Z"
    );
  });

  it("keeps explicit offsets and Date instances", () => {
    expect(parseLiveTimestamp("2026-08-26T21:42:00.000Z").toISOString()).toBe(
      "2026-08-26T21:42:00.000Z"
    );
    expect(parseLiveTimestamp("2026-08-26T18:42:00-03:00").toISOString()).toBe(
      "2026-08-26T21:42:00.000Z"
    );
    const date = new Date("2026-08-26T21:42:00.000Z");
    expect(parseLiveTimestamp(date)).toBe(date);
  });
});

describe(formatRelativeTime, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not report a just-written UTC timestamp as in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T21:42:00.000Z"));

    expect(formatRelativeTime("2026-08-26T21:42:00")).toBe("now");
  });
});
