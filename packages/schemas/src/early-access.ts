import { z } from "zod";

/**
 * Early-access request form — the three qualifying questions behind the
 * company email. Each maps to one ICP dimension: where support lives
 * (firmographic fit), weekly volume (trigger moment), and how much autonomy
 * they'd grant the Agent (the buying criterion).
 */

export const supportChannelSchema = z.enum([
  "slack",
  "discord",
  "github",
  "email",
  "helpdesk",
  "other",
]);
export type SupportChannel = z.infer<typeof supportChannelSchema>;

export const SUPPORT_CHANNEL_OPTIONS: {
  value: SupportChannel;
  label: string;
}[] = [
  { label: "Slack", value: "slack" },
  { label: "Discord", value: "discord" },
  { label: "GitHub", value: "github" },
  { label: "Email", value: "email" },
  { label: "Help desk (Intercom, Zendesk, Plain…)", value: "helpdesk" },
  { label: "Somewhere else", value: "other" },
];

export const conversationVolumeSchema = z.enum([
  "under_10",
  "10_50",
  "50_200",
  "over_200",
]);
export type ConversationVolume = z.infer<typeof conversationVolumeSchema>;

export const CONVERSATION_VOLUME_OPTIONS: {
  value: ConversationVolume;
  label: string;
}[] = [
  { label: "Fewer than 10", value: "under_10" },
  { label: "10 – 50", value: "10_50" },
  { label: "50 – 200", value: "50_200" },
  { label: "More than 200", value: "over_200" },
];

export const autonomyAppetiteSchema = z.enum([
  "drafts_only",
  "approve_each",
  "routine_autonomous",
  "mostly_autonomous",
]);
export type AutonomyAppetite = z.infer<typeof autonomyAppetiteSchema>;

export const AUTONOMY_APPETITE_OPTIONS: {
  value: AutonomyAppetite;
  label: string;
}[] = [
  { label: "Draft replies — I send them myself", value: "drafts_only" },
  { label: "Reply, but only after I approve", value: "approve_each" },
  {
    label: "Reply on its own to routine questions",
    value: "routine_autonomous",
  },
  { label: "Handle most conversations end to end", value: "mostly_autonomous" },
];

export const earlyAccessRequestSchema = z.object({
  autonomy: autonomyAppetiteSchema,
  // Bounded and deduped: the form offers each channel once, so anything
  // longer or repeated is a hand-rolled payload skewing qualification data.
  channels: z
    .array(supportChannelSchema)
    .min(1)
    .max(supportChannelSchema.options.length)
    .refine((values) => new Set(values).size === values.length, {
      message: "Channels must not repeat.",
    }),
  email: z.email(),
  volume: conversationVolumeSchema,
});

export type EarlyAccessRequestInput = z.infer<typeof earlyAccessRequestSchema>;
