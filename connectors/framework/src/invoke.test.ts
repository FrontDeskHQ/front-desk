import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ACTION_INVOKE_SECRET_HEADER,
  ACTION_INVOKE_TIMEOUT_MS,
  invokeCapability,
  invokeDeveloperAction,
} from "./invoke";

const envelope = {
  action: "pr_match_replay",
  config: "opaque-config",
  payload: { organizationId: "org-a", target: "owner/repo#1" },
};

describe("developer-action connector transport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends the private secret and returns the accepted result", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true, jobIds: ["job-1"] }), {
        status: 202,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      invokeDeveloperAction(
        "https://github.example/api/actions/invoke",
        envelope,
        {
          secret: "connector-secret",
        }
      )
    ).resolves.toStrictEqual({ accepted: true, jobIds: ["job-1"] });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://github.example/api/actions/invoke",
      expect.objectContaining({
        body: JSON.stringify(envelope),
        headers: {
          "Content-Type": "application/json",
          [ACTION_INVOKE_SECRET_HEADER]: "connector-secret",
        },
        method: "POST",
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("normalizes connector errors without returning the response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ secret: "must-not-leak" }), {
          status: 502,
        })
      )
    );

    await expect(
      invokeDeveloperAction(
        "https://github.example/api/actions/invoke",
        envelope
      )
    ).rejects.toThrow("DEVELOPER_ACTION_INVOKE_FAILED: 502");
    await expect(
      invokeDeveloperAction(
        "https://github.example/api/actions/invoke",
        envelope
      )
    ).rejects.not.toThrow("must-not-leak");
  });

  it("turns an unresponsive connector into a bounded timeout error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockRejectedValue(new DOMException("timed out", "TimeoutError"))
    );

    await expect(
      invokeDeveloperAction(
        "https://github.example/api/actions/invoke",
        envelope
      )
    ).rejects.toThrow(
      `DEVELOPER_ACTION_INVOKE_TIMEOUT: no response after ${ACTION_INVOKE_TIMEOUT_MS}ms`
    );
  });
});

describe("credential-bearing connector transport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects cleartext non-loopback endpoints before sending a secret", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      invokeCapability(
        "http://connector.example/api/capabilities/invoke",
        {
          capability: "issue-tracker",
          config: null,
          method: "readOutcome",
          payload: {},
        },
        { secret: "connector-secret" }
      )
    ).rejects.toThrow("CONNECTOR_INVOKE_REQUIRES_HTTPS");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects redirects when a capability request carries a secret", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await invokeCapability(
      "https://connector.example/api/capabilities/invoke",
      {
        capability: "issue-tracker",
        config: null,
        method: "readOutcome",
        payload: {},
      },
      { secret: "connector-secret" }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://connector.example/api/capabilities/invoke",
      expect.objectContaining({ redirect: "error" })
    );
  });
});
