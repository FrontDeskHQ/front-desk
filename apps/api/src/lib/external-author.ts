import type { ServerDB } from "@live-state/sync/server";
import { ulid } from "ulid";

import type { schema } from "../live-state/schema";

type ExternalAuthorDb = Pick<ServerDB<typeof schema>, "author">;

/**
 * Connectors send this when the provider lookup fails (Slack `users.info`,
 * etc.). Never overwrite a name we already have with it.
 */
export const UNRESOLVED_EXTERNAL_AUTHOR_NAME = "Unknown";

export interface EnsureExternalAuthorInput {
  metaId: string;
  name: string;
  organizationId: string;
}

export interface EnsureWidgetAuthorInput {
  name: string;
  organizationId: string;
  userId: string;
}

/** Namespace widget subjects so they cannot collide with connector author ids. */
export const widgetAuthorMetaId = (userId: string): string =>
  `widget:${userId}`;

const ensureAuthor = async (
  db: ExternalAuthorDb,
  input: EnsureExternalAuthorInput
): Promise<string> => {
  const existing = await db.author
    .first({ metaId: input.metaId, organizationId: input.organizationId })
    .get();

  if (!existing) {
    const id = ulid().toLowerCase();
    await db.author.insert({
      id,
      metaId: input.metaId,
      name: input.name,
      organizationId: input.organizationId,
      userId: null,
    });
    return id;
  }

  if (shouldRefreshExternalAuthorName(existing.name, input.name)) {
    await db.author.update(existing.id, { name: input.name });
  }

  return existing.id;
};

/**
 * Find-or-create the connector-relayed author for `(organizationId, metaId)`,
 * and refresh `name` when the provider sent a new one.
 *
 * Connector identities are keyed by the provider's stable user id (`metaId`),
 * not by display name — a Slack/Discord rename is the same author with a new
 * name, not a new author. Failed lookups that come through as `Unknown` do
 * not erase a name we already have.
 */
export const ensureExternalAuthor = async (
  db: ExternalAuthorDb,
  input: EnsureExternalAuthorInput
): Promise<string> => {
  if (input.metaId.startsWith("widget:")) {
    throw new Error("RESERVED_WIDGET_AUTHOR_META_ID");
  }

  return ensureAuthor(db, input);
};

/**
 * Find-or-create the authenticated widget contact for `(organizationId, sub)`.
 * The signed subject is the key; the browser-supplied display id is never used
 * to select a contact. Widget subjects are stored in metaId because author.userId
 * references FrontDesk's internal user table.
 */
export const ensureWidgetAuthor = async (
  db: ExternalAuthorDb,
  input: EnsureWidgetAuthorInput
): Promise<string> =>
  ensureAuthor(db, {
    metaId: widgetAuthorMetaId(input.userId),
    name: input.name,
    organizationId: input.organizationId,
  });

const shouldRefreshExternalAuthorName = (
  current: string,
  incoming: string
): boolean =>
  incoming !== current &&
  incoming.trim().length > 0 &&
  incoming !== UNRESOLVED_EXTERNAL_AUTHOR_NAME;
