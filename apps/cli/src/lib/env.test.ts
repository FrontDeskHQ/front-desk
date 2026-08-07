import { describe, expect, it } from "vitest";

import { assertLocalhostApiUrl } from "./env";

describe("localhost API URL guard", () => {
  it("allows IPv4, hostname, and IPv6 loopback URLs", () => {
    expect(() =>
      assertLocalhostApiUrl("http://localhost:3333/api/ls")
    ).not.toThrow();
    expect(() =>
      assertLocalhostApiUrl("http://127.0.0.1:3333/api/ls")
    ).not.toThrow();
    expect(() =>
      assertLocalhostApiUrl("http://[::1]:3333/api/ls")
    ).not.toThrow();
  });

  it("rejects non-local API URLs", () => {
    expect(() => assertLocalhostApiUrl("https://api.example.com")).toThrow(
      "non-localhost"
    );
  });
});
