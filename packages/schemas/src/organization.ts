import { z } from "zod";

import { actionAutonomyMapSchema } from "./signals";

const digestSettingsDefaults = {
  lastDigestSentAt: null,
  pendingReplyThresholdMinutes: 30,
  slackChannelId: null,
  slackChannelName: null,
  time: "09:00",
} as const;

export const digestSettingsSchema = z.object({
  lastDigestSentAt: z.string().nullable().default(null),
  pendingReplyThresholdMinutes: z.number().int().min(5).max(1440).default(30),
  slackChannelId: z.string().nullable().default(null),
  slackChannelName: z.string().nullable().default(null),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:mm")
    .default("09:00"),
});

/**
 * Where Agent-initiated issue creation lands. Distinct from
 * `capabilityPrimary["issue-tracker"]`, which answers *which external system*;
 * this answers *where inside it*. `target` is the same opaque,
 * connector-interpreted sub-resource selector `thread.createIssue` takes (e.g.
 * a GitHub `{ owner, repo }`) — core forwards it untouched. `label` is the
 * human-readable rendering shown in settings and on the accept card.
 *
 * The Agent never picks a target itself: when this is unset, synthesis falls
 * back to the first available target on the primary issue tracker (same rule
 * as `capabilityPrimary`).
 */
export const defaultIssueTargetSchema = z.object({
  /** Pins the issue-tracker integration; falls back to the capability primary. */
  integrationId: z.string().optional(),
  label: z.string().min(1),
  // `z.json()`, not `z.unknown()`: this lands in the `settings` JSON column, and
  // an `unknown` value breaks Live-State's serializable-type inference for
  // everything that reads an organization. `thread.createIssue` still takes the
  // looser `z.unknown()` — it forwards the target straight to a connector
  // without ever storing it.
  target: z.record(z.string(), z.json()),
});

export type DefaultIssueTarget = z.infer<typeof defaultIssueTargetSchema>;

export const organizationSettingsSchema = z.object({
  timezone: z.string().default("UTC"),
  digest: digestSettingsSchema.default(digestSettingsDefaults),
  actionAutonomy: actionAutonomyMapSchema.optional(),
  // Non-sensitive billing state, denormalized from the owner-only `subscription`
  // row so all members get correct feature gating. Billing identifiers
  // (customerId/subscriptionId) stay owner-only and are never synced here.
  // Constrained to the supported plan literals so stored settings can't drift
  // from the union the feature-gating logic assumes; unknown values coerce to
  // "trial" instead of leaking through as an arbitrary string.
  plan: z
    .enum(["trial", "starter", "pro", "beta-feedback"])
    .catch("trial")
    .default("trial"),
  subscriptionStatus: z.string().nullable().default(null),
  // Per-capability primary integration: a `capability → integrationId` map used
  // where target-routing doesn't apply (e.g. agent-initiated entity creation
  // with no implied target). Keys are connector capabilities (`issue-tracker`,
  // …); kept as an open string map so schemas stays free of a framework
  // dependency. The API validates the capability and integration on write.
  capabilityPrimary: z.record(z.string(), z.string()).optional(),
  defaultIssueTarget: defaultIssueTargetSchema.nullish(),
});

export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>;

/** Safely parse settings from the JSON column, falling back to defaults on null or invalid data. */
export const safeParseOrgSettings = (
  settings: unknown
): OrganizationSettings => {
  if (!settings) {
    return organizationSettingsSchema.parse({});
  }
  try {
    return organizationSettingsSchema.parse(settings);
  } catch {
    return organizationSettingsSchema.parse({});
  }
};

/**
 * Reads a capability's pinned primary integration id directly from raw settings,
 * without validating the rest of the object. Mirrors the write path, which
 * preserves unknown/invalid sibling keys — an unrelated bad field must not cause
 * a validly pinned primary to be silently dropped.
 */
export const readCapabilityPrimary = (
  settings: unknown,
  capability: string
): string | undefined => {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return undefined;
  }
  const primary = (settings as Record<string, unknown>).capabilityPrimary;
  if (!primary || typeof primary !== "object" || Array.isArray(primary)) {
    return undefined;
  }
  const value = (primary as Record<string, unknown>)[capability];
  return typeof value === "string" ? value : undefined;
};

/**
 * Reads the default issue target directly from raw settings, without validating
 * the rest of the object — same reasoning as `readCapabilityPrimary`: an
 * unrelated bad field must not silently drop a validly configured target.
 * Returns null when unset or malformed. Callers that need the Agent-effective
 * destination should fall back to the first available target (see
 * `resolveEffectiveDefaultIssueTarget` on the API).
 */
export const readDefaultIssueTarget = (
  settings: unknown
): DefaultIssueTarget | null => {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }
  const parsed = defaultIssueTargetSchema.safeParse(
    (settings as Record<string, unknown>).defaultIssueTarget
  );
  return parsed.success ? parsed.data : null;
};
