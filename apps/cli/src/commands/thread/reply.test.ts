import { describe, expect, it } from "vitest";

import { readReplyContent } from "./reply";

describe("customer reply input", () => {
  it("requires exactly one content source", async () => {
    await expect(readReplyContent({ ref: "thread-1" })).rejects.toThrow(
      "exactly one"
    );
    await expect(
      readReplyContent({
        message: "inline",
        messageFile: "/tmp/reply.md",
        ref: "thread-1",
      })
    ).rejects.toThrow("exactly one");
  });

  it("trims inline content", async () => {
    await expect(
      readReplyContent({ message: "  Follow-up  ", ref: "thread-1" })
    ).resolves.toBe("Follow-up");
  });
});
