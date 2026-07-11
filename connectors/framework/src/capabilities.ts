import { z } from "zod";

/**
 * The capabilities a connector can provide. The FrontDesk core interacts with
 * these generically and never references a named provider.
 *
 * Capabilities are asymmetric by call direction:
 * - *Emitting* (connector → core): `support-entry-point`.
 * - *Invoked* (core → connector): `issue-tracker`, `pr-tracker`,
 *   `notification-center`.
 *
 * See `docs/adr/0008-connector-capability-framework.md`.
 */
export const CAPABILITIES = [
  "support-entry-point",
  "issue-tracker",
  "pr-tracker",
  "notification-center",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const isCapability = (value: string): value is Capability =>
  (CAPABILITIES as readonly string[]).includes(value);

/**
 * `issue-tracker` capability — invoked method contracts.
 *
 * `create`: open a new issue on a target sub-resource. The `target` is an
 * opaque, provider-interpreted sub-resource selector (e.g. a GitHub
 * `{ owner, repo }`); core forwards it untouched.
 */
export const issueTrackerCreatePayloadSchema = z.object({
  title: z.string().min(1),
  body: z.string().default(""),
  target: z.record(z.string(), z.unknown()),
});

export type IssueTrackerCreatePayload = z.infer<
  typeof issueTrackerCreatePayloadSchema
>;

/**
 * Normalized entity returned by an issue-tracker `create`. Provider-neutral:
 * `id` is a stable external key, `label` a human-readable reference.
 */
export interface NormalizedIssue {
  /** Stable, provider-scoped external key (e.g. `github:owner/repo#123`). */
  id: string;
  /**
   * Provider-local short reference, as a string so any tracker fits (GitHub
   * `"123"`, Jira `"PROJ-123"`, Linear `"ENG-456"`).
   */
  shortId: string;
  title: string;
  body: string;
  state: string;
  url: string;
  /** Human-readable reference, e.g. `owner/repo#123`. */
  label: string;
}

export interface IssueTrackerCreateResult {
  entity: NormalizedIssue;
}

/**
 * Provider-neutral reference to an already-mirrored external entity that the
 * core hands a connector so it can act on it (close it, comment on it). Core
 * fills these straight from the `externalEntity` mirror row; only the connector
 * interprets them (e.g. GitHub resolves `repoFullName` + `number` against its
 * configured repos). The core never parses them or names a provider.
 */
export const capabilityEntityRefSchema = z.object({
  /** Provider-agnostic key: `provider:owner/repo#id` (see formatGitHubId). */
  externalKey: z.string().min(1),
  /** Repository the entity lives in, e.g. `owner/repo`. */
  repoFullName: z.string().min(1),
  /** Provider-local entity number (issue/PR number). */
  number: z.number().int(),
  /** Canonical external URL of the entity. */
  url: z.string(),
});

export type CapabilityEntityRef = z.infer<typeof capabilityEntityRefSchema>;

/**
 * `issue-tracker` `setState` — push an open/closed state onto an existing issue,
 * keeping the external issue in sync with its linked thread's status. Routed by
 * the mirrored entity's owning integration; there is no provider selection.
 */
export const issueTrackerSetStatePayloadSchema = z.object({
  entity: capabilityEntityRefSchema,
  state: z.enum(["open", "closed"]),
});

export type IssueTrackerSetStatePayload = z.infer<
  typeof issueTrackerSetStatePayloadSchema
>;

/**
 * `pr-tracker` `link` — record a back-reference from an existing pull request to
 * the FrontDesk thread it was linked to (a cross-link comment). The connector
 * composes the provider-native comment from the neutral `thread` fields.
 */
export const prTrackerLinkPayloadSchema = z.object({
  entity: capabilityEntityRefSchema,
  thread: z.object({
    /** Portal URL of the linked thread, for the back-reference. */
    url: z.string(),
    title: z.string().default(""),
  }),
});

export type PrTrackerLinkPayload = z.infer<typeof prTrackerLinkPayloadSchema>;
