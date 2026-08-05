import type { EarlyAccessRequestInput } from "@workspace/schemas/early-access";
import {
  AUTONOMY_APPETITE_OPTIONS,
  CONVERSATION_VOLUME_OPTIONS,
  SUPPORT_CHANNEL_OPTIONS,
} from "@workspace/schemas/early-access";

const DISCORD_WAITLIST_WEBHOOK_TIMEOUT_MS = 5000;

type WaitlistSignup = EarlyAccessRequestInput & {
  createdAt: Date;
};

const labelFor = <Value extends string>(
  options: readonly { label: string; value: Value }[],
  value: Value
) => options.find((option) => option.value === value)?.label ?? value;

/**
 * Notify the internal Discord channel about a new waitlist signup.
 *
 * The webhook is optional so local environments can submit the form without
 * needing Discord configured. Callers decide how to handle delivery errors so
 * a notification outage cannot reject a successful signup.
 */
export async function notifyWaitlistSignup(
  signup: WaitlistSignup
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WAITLIST_WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }

  const response = await fetch(webhookUrl, {
    body: JSON.stringify({
      allowed_mentions: { parse: [] },
      embeds: [
        {
          color: 0x5865f2,
          fields: [
            { name: "Email", value: signup.email },
            {
              name: "Support channels",
              value: signup.channels
                .map((channel) => labelFor(SUPPORT_CHANNEL_OPTIONS, channel))
                .join(", "),
            },
            {
              name: "Weekly volume",
              value: labelFor(CONVERSATION_VOLUME_OPTIONS, signup.volume),
            },
            {
              name: "Autonomy",
              value: labelFor(AUTONOMY_APPETITE_OPTIONS, signup.autonomy),
            },
          ],
          timestamp: signup.createdAt.toISOString(),
          title: "New waitlist signup",
        },
      ],
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(DISCORD_WAITLIST_WEBHOOK_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Discord waitlist webhook failed with status ${response.status}`
    );
  }
}
