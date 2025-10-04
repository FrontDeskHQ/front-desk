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
  email: string(),
  createdAt: timestamp(),
  expiresAt: timestamp(),
  active: boolean().default(true),
});

const organizationRelations = createRelations(organization, ({ many }) => ({
  organizationUsers: many(organizationUser, "organizationId"),
  threads: many(thread, "organizationId"),
  invites: many(invite, "organizationId"),
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
}));

export const schema = createSchema({
  // models
  organization,
  author,
  organizationUser,
  thread,
  message,
  user,
  invite,
  // relations
  organizationUserRelations,
  organizationRelations,
  threadRelations,
  messageRelations,
  authorRelations,
  inviteRelations,
});
