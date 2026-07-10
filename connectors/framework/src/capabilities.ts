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
