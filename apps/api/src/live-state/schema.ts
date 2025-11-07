import {
  boolean,
  createRelations,
  createSchema,
  id,
  number,
  object,
  reference,
  string,
  timestamp,
} from "@live-state/sync";

const organization = object("organization", {
  id: id(),
  name: string(),
  slug: string(),
  createdAt: timestamp(),
  logoUrl: string().nullable(),
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
  discordChannelId: string().nullable(),
  status: number().default(0),
  priority: number().default(0),
  assignedUserId: reference("user.id").nullable(),
});

const message = object("message", {
  id: id(),
  threadId: reference("thread.id"),
  authorId: reference("author.id"),
  content: string(),
  createdAt: timestamp(),
  origin: string().nullable(),
  externalMessageId: string().nullable(),
});

const author = object("author", {
  id: id(),
  name: string(),
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
  // FIXME make this a JSON object when live-state supports it
  configStr: string().nullable(),
});

const organizationRelations = createRelations(organization, ({ many }) => ({
  organizationUsers: many(organizationUser, "organizationId"),
  threads: many(thread, "organizationId"),
  invites: many(invite, "organizationId"),
  integrations: many(integration, "organizationId"),
  subscriptions: many(subscription, "organizationId"),
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
  organization: one(organization, "organizationId"),
  messages: many(message, "threadId"),
  assignedUser: one(user, "assignedUserId"),
  author: one(author, "authorId"),
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

// This is a list of emails that are allowed to access the app - will be removed after the beta.
const allowlist = object("allowlist", {
  id: id(),
  email: string().unique().index(),
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
  allowlist,
  // relations
  organizationUserRelations,
  organizationRelations,
  threadRelations,
  messageRelations,
  authorRelations,
  inviteRelations,
  integrationRelations,
  subscriptionRelations,
});
