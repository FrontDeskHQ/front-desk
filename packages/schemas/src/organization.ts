import { z } from "zod";

const digestSettingsDefaults = {
  pendingReplyThresholdMinutes: 30,
  time: "09:00",
  slackChannelId: null,
  slackChannelName: null,
} as const;

export const digestSettingsSchema = z.object({
  pendingReplyThresholdMinutes: z.number().int().min(5).max(1440).default(30),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:mm")
    .default("09:00"),
  slackChannelId: z.string().nullable().default(null),
  slackChannelName: z.string().nullable().default(null),
});

export const organizationSettingsSchema = z.object({
  timezone: z.string().default("UTC"),
  digest: digestSettingsSchema.default(digestSettingsDefaults),
});

export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>;

/** Safely parse settings from the JSON column, falling back to defaults on null or invalid data. */
export const safeParseOrgSettings = (
  settings: unknown,
): OrganizationSettings => {
  if (!settings) return organizationSettingsSchema.parse({});
  try {
    return organizationSettingsSchema.parse(settings);
  } catch {
    return organizationSettingsSchema.parse({});
  }
};
