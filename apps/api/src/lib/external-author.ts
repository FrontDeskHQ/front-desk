import type { ServerDB } from "@live-state/sync/server";
import { ulid } from "ulid";

import type { schema } from "../live-state/schema";

type ExternalAuthorDb = Pick<ServerDB<typeof schema>, "author">;

/**
 * Connectors send this when the provider lookup fails (Slack `users.info`,
 * etc.). Never overwrite a name we already have with it.
 */
export const UNRESOLVED_EXTERNAL_AUTHOR_NAME = "Unknown";

export type EnsureExternalAuthorInput = {
  metaId: string;
  name: string;
  organizationId: string;
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

const shouldRefreshExternalAuthorName = (
  current: string,
  incoming: string
): boolean =>
  incoming !== current &&
  incoming.trim().length > 0 &&
  incoming !== UNRESOLVED_EXTERNAL_AUTHOR_NAME;
