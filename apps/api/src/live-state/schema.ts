import {
  boolean,
  createRelations,
  createSchema,
  id,
  json,
  number,
  object,
  reference,
  string,
  timestamp,
} from "@live-state/sync";
import type { OrganizationSettings } from "@workspace/schemas/organization";
import type {
  Hints,
  InlineSuggestion,
  ThreadRead,
} from "@workspace/schemas/signals";

const organization = object("organization", {
  id: id(),
  name: string(),
  slug: string().unique().index(),
  createdAt: timestamp(),
  logoUrl: string().nullable(),
  socials: string().nullable(),
  customInstructions: string().nullable(),
  settings: json<OrganizationSettings>().nullable(),
  shortIdCounter: number().default(0),
});

const subscription = object("subscription", {
  id: id(),
  customerId: string().nullable(),
  subscriptionId: string().nullable(),
  organizationId: reference("organization.id"),
  plan: string().default("trial"),
  status: string().nullable(),
  seats: number().default(1),
  createdAt: timestamp(),
  updatedAt: timestamp(),
});

const organizationUser = object("organizationUser", {
  id: id(),
  organizationId: reference("organization.id"),
  userId: reference("user.id"),
  enabled: boolean().default(true),
  role: string().default("user"),
});

const thread = object("thread", {
  id: id(),
  organizationId: reference("organization.id"),
  name: string(),
  authorId: reference("author.id"),
  createdAt: timestamp(),
  deletedAt: timestamp().nullable(),
  /** @deprecated use externalId and externalOrigin instead */
  discordChannelId: string().nullable(),
  // Link to a mirrored externalEntity by its externalKey (`provider:owner/repo#number`).
  externalIssueId: string().nullable(),
  externalPrId: string().nullable(),
  status: number().default(0),
  priority: number().default(0),
  assignedUserId: reference("user.id").nullable(),
  externalId: string().nullable(),
  externalOrigin: string().nullable(),
  externalMetadataStr: string().nullable(),
  shortId: number().nullable(),
  agentRead: json<ThreadRead | null>().nullable(),
  inlineSuggestions: json<InlineSuggestion[]>().default([]),
  hints: json<Hints>().default({}),
});

const message = object("message", {
  id: id(),
  threadId: reference("thread.id"),
  authorId: reference("author.id"),
  content: string(),
  createdAt: timestamp(),
  origin: string().nullable(),
  isBackfill: boolean().default(false),
  externalMessageId: string().nullable(),
  markedAsAnswer: boolean().default(false),
});

const author = object("author", {
  id: id(),
  name: string(),
  // TODO make this required after migration
  organizationId: reference("organization.id").nullable(),
  /**
   * This is used to identify the author in the external system.
   * For example, in Discord, this is the user ID.
   */
  metaId: string().nullable(),
  userId: reference("user.id").nullable(),
});

const user = object("user", {
  id: id(),
  name: string(),
  email: string(),
  emailVerified: boolean().default(false),
  image: string().nullable(),
  createdAt: timestamp(),
  updatedAt: timestamp(),
});

const invite = object("invite", {
  id: id(),
  organizationId: reference("organization.id"),
  creatorId: reference("user.id"),
  email: string(),
  createdAt: timestamp(),
  expiresAt: timestamp(),
  active: boolean().default(true),
});

const integration = object("integration", {
  id: id(),
  organizationId: reference("organization.id"),
  type: string(),
  enabled: boolean().default(false),
  createdAt: timestamp(),
  updatedAt: timestamp(),
  // TODO make this a JSON object when live-state supports it
  configStr: string().nullable(),
});

const update = object("update", {
  id: id(),
  threadId: reference("thread.id"),
  userId: reference("user.id").nullable(),
  type: string(),
  createdAt: timestamp(),
  // TODO make this a JSON object when live-state supports it
  metadataStr: string().nullable(),
  replicatedStr: string().nullable(),
});

const label = object("label", {
  id: id(),
  name: string(),
  color: string(),
  createdAt: timestamp(),
  updatedAt: timestamp(),
  organizationId: reference("organization.id"),
  enabled: boolean().default(true),
});

const threadLabel = object("threadLabel", {
  id: id(),
  threadId: reference("thread.id"),
  labelId: reference("label.id"),
  enabled: boolean().default(true),
});

// TODO(live-state): composite index (organizationId, appliedAt desc) when supported.
// Until then, single-column indexes plus query-side orderBy("appliedAt","desc").
const autonomousAction = object("autonomousAction", {
  id: id(),
  organizationId: reference("organization.id").index(),
  signalType: string(),
  entityId: string(),
  appliedAt: timestamp().index(),
  undoneAt: timestamp().nullable(),
  metadataStr: string().nullable(),
});

const onboarding = object("onboarding", {
  id: id(),
  organizationId: reference("organization.id"),
  stepsStr: string().default("{}"), // JSON: { "step-id": { completedAt: "..." } }
  status: string().default("incomplete"), // "incomplete" | "completed" | "skipped"
  createdAt: timestamp(),
  updatedAt: timestamp(),
});

const agentChat = object("agentChat", {
  id: id(),
  organizationId: reference("organization.id"),
  userId: reference("user.id"),
  threadId: reference("thread.id"),
  createdAt: timestamp(),
  draft: string().nullable(),
  draftStatus: string().default("none"),
});

const agentChatMessage = object("agentChatMessage", {
  id: id(),
  agentChatId: reference("agentChat.id"),
  role: string(),
  content: string(),
  toolCalls: string().nullable(),
  createdAt: timestamp(),
});

const documentationSource = object("documentationSource", {
  id: id(),
  organizationId: reference("organization.id"),
  name: string(),
  baseUrl: string(),
  status: string(), // "pending" | "crawling" | "completed" | "failed"
  lastCrawledAt: timestamp().nullable(),
  pageCount: number().default(0),
  chunksIndexed: number().default(0),
  errorStr: string().nullable(),
  createdAt: timestamp(),
  updatedAt: timestamp(),
});

/**
 * A read-only mirror of an issue or pull request from an external developer
 * system (today only GitHub). The external system is authoritative; rows here
 * are only ever written from inbound webhooks/backfill/drift reconciliation,
 * never canonically from our side. See docs/adr/0007-mirror-external-issues-prs.md.
 *
 * Synced to clients so the UI can display and search issue/PR data reactively.
 */
// TODO(live-state): composite index (organizationId, externalKey) when supported.
// Until then, externalKey single-column index plus query-side organizationId filter.
const externalEntity = object("externalEntity", {
  id: id(),
  organizationId: reference("organization.id"),
  provider: string(),
  /** Provider-agnostic key: `provider:owner/repo#number` (see formatGitHubId). */
  externalKey: string().index(),
  /** "issue" | "pull_request" */
  type: string(),
  number: number(),
  repoFullName: string(),
  url: string(),
  title: string(),
  body: string().nullable(),
  state: string(),
  authorLogin: string().nullable(),
  assignees: json<string[]>().default([]),
  labels: json<string[]>().default([]),
  externalCreatedAt: timestamp(),
  externalUpdatedAt: timestamp(),
  closedAt: timestamp().nullable(),
  // PR-only facets, null for issues.
  merged: boolean().nullable(),
  mergedAt: timestamp().nullable(),
  draft: boolean().nullable(),
  headRef: string().nullable(),
  baseRef: string().nullable(),
  lastSyncedAt: timestamp(),
  deletedAt: timestamp().nullable(),
});

const organizationRelations = createRelations(organization, ({ many }) => ({
  organizationUsers: many(organizationUser, "organizationId"),
  threads: many(thread, "organizationId"),
  invites: many(invite, "organizationId"),
  integrations: many(integration, "organizationId"),
  subscriptions: many(subscription, "organizationId"),
  labels: many(label, "organizationId"),
  authors: many(author, "organizationId"),
  autonomousActions: many(autonomousAction, "organizationId"),
  onboardings: many(onboarding, "organizationId"),
  documentationSources: many(documentationSource, "organizationId"),
  agentChats: many(agentChat, "organizationId"),
  externalEntities: many(externalEntity, "organizationId"),
}));

const subscriptionRelations = createRelations(subscription, ({ one }) => ({
  organization: one(organization, "organizationId"),
}));

const organizationUserRelations = createRelations(
  organizationUser,
  ({ one }) => ({
    organization: one(organization, "organizationId"),
    user: one(user, "userId"),
  }),
);

const threadRelations = createRelations(thread, ({ one, many }) => ({
  organization: one(organization, "organizationId"),
  messages: many(message, "threadId"),
  assignedUser: one(user, "assignedUserId"),
  author: one(author, "authorId"),
  updates: many(update, "threadId"),
  labels: many(threadLabel, "threadId"),
}));

const messageRelations = createRelations(message, ({ one }) => ({
  thread: one(thread, "threadId"),
  author: one(author, "authorId"),
}));

const authorRelations = createRelations(author, ({ one }) => ({
  user: one(user, "userId", false),
}));

const inviteRelations = createRelations(invite, ({ one }) => ({
  organization: one(organization, "organizationId"),
  creator: one(user, "creatorId"),
}));

const integrationRelations = createRelations(integration, ({ one }) => ({
  organization: one(organization, "organizationId"),
}));

const updateRelations = createRelations(update, ({ one }) => ({
  thread: one(thread, "threadId"),
  user: one(user, "userId"),
}));

const labelRelations = createRelations(label, ({ one, many }) => ({
  organization: one(organization, "organizationId"),
  threads: many(threadLabel, "labelId"),
}));

const threadLabelRelations = createRelations(threadLabel, ({ one }) => ({
  thread: one(thread, "threadId"),
  label: one(label, "labelId"),
}));

const autonomousActionRelations = createRelations(
  autonomousAction,
  ({ one }) => ({
    organization: one(organization, "organizationId"),
  }),
);

const onboardingRelations = createRelations(onboarding, ({ one }) => ({
  organization: one(organization, "organizationId"),
}));

const agentChatRelations = createRelations(agentChat, ({ one, many }) => ({
  organization: one(organization, "organizationId"),
  user: one(user, "userId"),
  thread: one(thread, "threadId"),
  messages: many(agentChatMessage, "agentChatId"),
}));

const agentChatMessageRelations = createRelations(
  agentChatMessage,
  ({ one }) => ({
    agentChat: one(agentChat, "agentChatId"),
  }),
);

const documentationSourceRelations = createRelations(
  documentationSource,
  ({ one }) => ({
    organization: one(organization, "organizationId"),
  }),
);

const externalEntityRelations = createRelations(externalEntity, ({ one }) => ({
  organization: one(organization, "organizationId"),
}));

// This is a list of emails that are allowed to access the app - will be removed after the beta.
const allowlist = object("allowlist", {
  id: id(),
  email: string().unique().index(),
});

/**
 *  Ingesting-related tables
 *
 *  These tables are used to store the data for the ingesting pipeline.
 *  They are not synced to the clients.
 */

const pipelineIdempotencyKey = object("pipelineIdempotencyKey", {
  id: id(),
  key: string().unique().index(),
  hash: string(),
  createdAt: timestamp(),
});

const pipelineJob = object("pipelineJob", {
  id: id(),
  name: string(),
  status: string(),
  metadataStr: string().nullable(),
  createdAt: timestamp(),
  updatedAt: timestamp(),
});

const migration = object("migration", {
  id: id(),
  appliedAt: timestamp(),
});

export const schema = createSchema({
  // models
  organization,
  subscription,
  author,
  organizationUser,
  thread,
  message,
  user,
  invite,
  integration,
  update,
  allowlist,
  label,
  threadLabel,
  autonomousAction,
  pipelineIdempotencyKey,
  pipelineJob,
  onboarding,
  documentationSource,
  agentChat,
  agentChatMessage,
  externalEntity,
  migration,
  // relations
  organizationUserRelations,
  organizationRelations,
  threadRelations,
  messageRelations,
  authorRelations,
  inviteRelations,
  integrationRelations,
  subscriptionRelations,
  updateRelations,
  labelRelations,
  threadLabelRelations,
  autonomousActionRelations,
  onboardingRelations,
  documentationSourceRelations,
  agentChatRelations,
  agentChatMessageRelations,
  externalEntityRelations,
});
