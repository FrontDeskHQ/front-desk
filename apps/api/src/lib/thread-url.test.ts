import { describe, expect, it } from "vitest";

import { buildWorkspaceThreadUrl } from "./thread-url";

describe("workspace thread URLs", () => {
  it("builds a private workspace thread URL", () => {
    expect(
      buildWorkspaceThreadUrl("https://tryfrontdesk.app", "thread-123")
    ).toBe("https://tryfrontdesk.app/app/threads/thread-123");
  });

  it("keeps a development port and discards base URL state", () => {
    expect(
      buildWorkspaceThreadUrl(
        "http://localhost:3000/old/path?query=yes#section",
        "thread/123"
      )
    ).toBe("http://localhost:3000/app/threads/thread%2F123");
  });
});
