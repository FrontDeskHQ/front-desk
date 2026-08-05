import type { EarlyAccessRequestInput } from "@workspace/schemas/early-access";
import { afterEach, describe, expect, it, vi } from "vitest";

import { notifyWaitlistSignup } from "./waitlist-discord";

const signup: EarlyAccessRequestInput & { createdAt: Date } = {
  autonomy: "routine_autonomous",
  channels: ["slack", "discord"],
  createdAt: new Date("2026-08-05T12:00:00.000Z"),
  email: "founder@example.com",
  volume: "50_200",
};

describe("waitlist Discord notifications", () => {
  const previousWebhookUrl = process.env.DISCORD_WAITLIST_WEBHOOK_URL;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (previousWebhookUrl === undefined) {
      delete process.env.DISCORD_WAITLIST_WEBHOOK_URL;
    } else {
      process.env.DISCORD_WAITLIST_WEBHOOK_URL = previousWebhookUrl;
    }
  });

  it("does nothing when the webhook is not configured", async () => {
    delete process.env.DISCORD_WAITLIST_WEBHOOK_URL;
    const fetchMock = vi.fn<() => void>();
    vi.stubGlobal("fetch", fetchMock);

    await notifyWaitlistSignup(signup);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the signup details as a Discord embed", async () => {
    process.env.DISCORD_WAITLIST_WEBHOOK_URL =
      "https://discord.com/api/webhooks/test/token";
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetchMock);

    await notifyWaitlistSignup(signup);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://discord.com/api/webhooks/test/token",
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
    );
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toStrictEqual({
      allowed_mentions: { parse: [] },
      embeds: [
        {
          color: 0x5865f2,
          fields: [
            { name: "Email", value: "founder@example.com" },
            { name: "Support channels", value: "Slack, Discord" },
            { name: "Weekly volume", value: "50 – 200" },
            {
              name: "Autonomy",
              value: "Reply on its own to routine questions",
            },
          ],
          timestamp: "2026-08-05T12:00:00.000Z",
          title: "New waitlist signup",
        },
      ],
    });
  });

  it("throws when Discord rejects the webhook", async () => {
    process.env.DISCORD_WAITLIST_WEBHOOK_URL =
      "https://discord.com/api/webhooks/test/token";
    vi.stubGlobal(
      "fetch",
      vi.fn<() => Promise<Response>>(() =>
        Promise.resolve(new Response(null, { status: 400 }))
      )
    );

    await expect(notifyWaitlistSignup(signup)).rejects.toThrow(
      "Discord waitlist webhook failed with status 400"
    );
  });
});
