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
  createdAt: timestamp(),
  customInstructions: string().nullable(),
  id: id(),
  logoUrl: string().nullable(),
  name: string(),
  settings: json<OrganizationSettings>().nullable(),
  shortIdCounter: number().default(0),
  slug: string().unique().index(),
  socials: string().nullable(),
});

const subscription = object("subscription", {
  createdAt: timestamp(),
  customerId: string().nullable(),
  id: id(),
  organizationId: reference("organization.id"),
  plan: string().default("trial"),
  seats: number().default(1),
  status: string().nullable(),
  subscriptionId: string().nullable(),
  updatedAt: timestamp(),
});

const organizationUser = object("organizationUser", {
  enabled: boolean().default(true),
  id: id(),
  organizationId: reference("organization.id"),
  role: string().default("user"),
  userId: reference("user.id"),
});

const thread = object("thread", {
  id: id(),
  organizationId: reference("organization.id"),
  name: string(),
  authorId: reference("author.id"),
  createdAt: timestamp(),
  deletedAt: timestamp().nullable(),
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
  authorId: reference("author.id"),
  content: string(),
  createdAt: timestamp(),
  externalMessageId: string().nullable(),
  id: id(),
  isBackfill: boolean().default(false),
  markedAsAnswer: boolean().default(false),
  origin: string().nullable(),
  threadId: reference("thread.id"),
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
  createdAt: timestamp(),
  email: string(),
  emailVerified: boolean().default(false),
  id: id(),
  image: string().nullable(),
  name: string(),
  updatedAt: timestamp(),
});

const invite = object("invite", {
  active: boolean().default(true),
  createdAt: timestamp(),
  creatorId: reference("user.id"),
  email: string(),
  expiresAt: timestamp(),
  id: id(),
  organizationId: reference("organization.id"),
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
  color: string(),
  createdAt: timestamp(),
  enabled: boolean().default(true),
  id: id(),
  name: string(),
  organizationId: reference("organization.id"),
  updatedAt: timestamp(),
});

const threadLabel = object("threadLabel", {
  enabled: boolean().default(true),
  id: id(),
  labelId: reference("label.id"),
  threadId: reference("thread.id"),
});

// TODO(live-state): composite index (organizationId, appliedAt desc) when supported.
// Until then, single-column indexes plus query-side orderBy("appliedAt","desc").
const autonomousAction = object("autonomousAction", {
  appliedAt: timestamp().index(),
  entityId: string(),
  id: id(),
  metadataStr: string().nullable(),
  organizationId: reference("organization.id").index(),
  signalType: string(),
  undoneAt: timestamp().nullable(),
});

const onboarding = object("onboarding", {
  createdAt: timestamp(),
  id: id(),
  organizationId: reference("organization.id"),
  status: string().default("incomplete"), // "incomplete" | "completed" | "skipped"
  stepsStr: string().default("{}"), // JSON: { "step-id": { completedAt: "..." } }
  updatedAt: timestamp(),
});

const agentChat = object("agentChat", {
  createdAt: timestamp(),
  draft: string().nullable(),
  draftStatus: string().default("none"),
  id: id(),
  organizationId: reference("organization.id"),
  threadId: reference("thread.id"),
  userId: reference("user.id"),
});

const agentChatMessage = object("agentChatMessage", {
  agentChatId: reference("agentChat.id"),
  content: string(),
  createdAt: timestamp(),
  id: id(),
  role: string(),
  toolCalls: string().nullable(),
});

const documentationSource = object("documentationSource", {
  baseUrl: string(),
  chunksIndexed: number().default(0),
  createdAt: timestamp(),
  errorStr: string().nullable(),
  id: id(),
  lastCrawledAt: timestamp().nullable(),
  name: string(),
  organizationId: reference("organization.id"),
  pageCount: number().default(0),
  status: string(), // "pending" | "crawling" | "completed" | "failed"
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
  agentChats: many(agentChat, "organizationId"),
  authors: many(author, "organizationId"),
  autonomousActions: many(autonomousAction, "organizationId"),
  documentationSources: many(documentationSource, "organizationId"),
  externalEntities: many(externalEntity, "organizationId"),
  integrations: many(integration, "organizationId"),
  invites: many(invite, "organizationId"),
  labels: many(label, "organizationId"),
  onboardings: many(onboarding, "organizationId"),
  organizationUsers: many(organizationUser, "organizationId"),
  subscriptions: many(subscription, "organizationId"),
  threads: many(thread, "organizationId"),
}));

const subscriptionRelations = createRelations(subscription, ({ one }) => ({
  organization: one(organization, "organizationId"),
}));

const organizationUserRelations = createRelations(
  organizationUser,
  ({ one }) => ({
    organization: one(organization, "organizationId"),
    user: one(user, "userId"),
  })
);

const threadRelations = createRelations(thread, ({ one, many }) => ({
  assignedUser: one(user, "assignedUserId"),
  author: one(author, "authorId"),
  labels: many(threadLabel, "threadId"),
  messages: many(message, "threadId"),
  organization: one(organization, "organizationId"),
  updates: many(update, "threadId"),
}));

const messageRelations = createRelations(message, ({ one }) => ({
  author: one(author, "authorId"),
  thread: one(thread, "threadId"),
}));

const authorRelations = createRelations(author, ({ one }) => ({
  user: one(user, "userId", false),
}));

const inviteRelations = createRelations(invite, ({ one }) => ({
  creator: one(user, "creatorId"),
  organization: one(organization, "organizationId"),
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
  label: one(label, "labelId"),
  thread: one(thread, "threadId"),
}));

const autonomousActionRelations = createRelations(
  autonomousAction,
  ({ one }) => ({
    organization: one(organization, "organizationId"),
  })
);

const onboardingRelations = createRelations(onboarding, ({ one }) => ({
  organization: one(organization, "organizationId"),
}));

const agentChatRelations = createRelations(agentChat, ({ one, many }) => ({
  messages: many(agentChatMessage, "agentChatId"),
  organization: one(organization, "organizationId"),
  thread: one(thread, "threadId"),
  user: one(user, "userId"),
}));

const agentChatMessageRelations = createRelations(
  agentChatMessage,
  ({ one }) => ({
    agentChat: one(agentChat, "agentChatId"),
  })
);

const documentationSourceRelations = createRelations(
  documentationSource,
  ({ one }) => ({
    organization: one(organization, "organizationId"),
  })
);

const externalEntityRelations = createRelations(externalEntity, ({ one }) => ({
  organization: one(organization, "organizationId"),
}));

// This is a list of emails that are allowed to access the app - will be removed after the beta.
const allowlist = object("allowlist", {
  email: string().unique().index(),
  id: id(),
});

/**
 *  Ingesting-related tables
 *
 *  These tables are used to store the data for the ingesting pipeline.
 *  They are not synced to the clients.
 */

const pipelineIdempotencyKey = object("pipelineIdempotencyKey", {
  createdAt: timestamp(),
  hash: string(),
  id: id(),
  key: string().unique().index(),
});

const pipelineJob = object("pipelineJob", {
  createdAt: timestamp(),
  id: id(),
  metadataStr: string().nullable(),
  name: string(),
  status: string(),
  updatedAt: timestamp(),
});

const migration = object("migration", {
  appliedAt: timestamp(),
  id: id(),
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
