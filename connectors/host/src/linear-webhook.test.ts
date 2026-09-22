import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyLinearWebhook } from "./linear-webhook";

describe(verifyLinearWebhook, () => {
  it("accepts only the HMAC of the exact raw request body", () => {
    const body = JSON.stringify({ action: "update", type: "Issue" });
    const signature = createHmac("sha256", "secret").update(body).digest("hex");

    expect(verifyLinearWebhook(body, signature, "secret")).toBeTruthy();
    expect(verifyLinearWebhook(`${body}\n`, signature, "secret")).toBeFalsy();
  });
});
