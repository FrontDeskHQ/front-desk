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
 * `support-entry-point` capability — the emitting leg (connector → core).
 *
 * A connector translates a provider event into these neutral shapes and calls
 * the core's `mutate.ingest` procedure. The core owns normalization: idempotent
 * create-vs-append keyed on `(organizationId, externalThreadId,
 * externalMessageId)`, author find-or-create, and the `provider:` prefixing
 * convention. The connector keeps only the un-liftable provider work — event
 * translation and resolving a raw user id → display name.
 *
 * See `docs/adr/0009-emitting-side-connector-retrofit.md`.
 */

/** Neutral author identity. `externalId` is the raw provider user id (the core
 * prefixes it with `provider:` to form the author `metaId`); the connector
 * resolves `name` from the provider. */
export const supportEntryPointAuthorSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  avatarUrl: z.string().optional(),
});

export type SupportEntryPointAuthor = z.infer<
  typeof supportEntryPointAuthorSchema
>;

/**
 * Creation-only thread descriptor. Optional: the core decides create-vs-append
 * by whether a thread already exists for `externalThreadId`, so on an append the
 * descriptor is ignored. It is required (its `title`) the first time an external
 * thread is seen — the core hard-errors on an unknown external thread with no
 * descriptor rather than create a titleless thread.
 */
export const supportEntryPointThreadSchema = z.object({
  title: z.string().min(1),
  externalMetadata: z.record(z.string(), z.unknown()).optional(),
});

export type SupportEntryPointThread = z.infer<
  typeof supportEntryPointThreadSchema
>;

/** A single inbound message. `body` is TipTap JSON or a plain string; the core
 * serializes it for storage. */
export const supportEntryPointMessageSchema = z.object({
  externalMessageId: z.string().min(1),
  // Plain string or TipTap JSON; require it to be present so a malformed event
  // is rejected instead of persisted as the literal string "undefined".
  body: z.unknown().refine((value) => value !== undefined, {
    message: "body is required",
  }),
  // Accept a Date (in-process) or string (over the wire); reject null so a
  // malformed event is not coerced to the Unix epoch and misordered.
  createdAt: z.union([z.date(), z.string()]).pipe(z.coerce.date()),
});

export type SupportEntryPointMessage = z.infer<
  typeof supportEntryPointMessageSchema
>;

/**
 * The full `ingest` payload. `externalThreadId` is always present — it is both
 * the append target and part of the idempotency key — while the richer `thread`
 * descriptor is attached only for creation. `isBackfill` suppresses downstream
 * pipeline triggers only; it does not change normalization.
 */
export const supportEntryPointIngestSchema = z.object({
  organizationId: z.string().min(1),
  /** Integration `type` of the emitting connector, e.g. `"discord"`. Becomes
   * the thread's `externalOrigin` and the author `metaId` prefix. */
  provider: z.string().min(1),
  externalThreadId: z.string().min(1),
  thread: supportEntryPointThreadSchema.optional(),
  message: supportEntryPointMessageSchema,
  author: supportEntryPointAuthorSchema,
  isBackfill: z.boolean().default(false),
});

export type SupportEntryPointIngestPayload = z.infer<
  typeof supportEntryPointIngestSchema
>;

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
  /** Provider-local entity number (issue/PR number); always ≥ 1. */
  number: z.number().int().positive(),
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
