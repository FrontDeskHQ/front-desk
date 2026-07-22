import type { InferLiveObject } from "@live-state/sync";
import type { schema } from "api/schema";
import { z } from "zod";

import type { LiveStateFetchClient, LiveStateStore } from "./live-state";

/** The per-provider replicated-marker map stored on `update.replicatedStr`. */
const replicatedSchema = z.record(z.string(), z.unknown());

/** Outbound message row, with the includes every connector needs to deliver it. */
export type OutboundMessage = InferLiveObject<
  (typeof schema)["message"],
  { thread: true; author: { include: { user: true } } }
>;

/** Outbound thread-update row, with the includes needed to format it. */
export type OutboundUpdate = InferLiveObject<
  (typeof schema)["update"],
  { thread: true; user: true }
>;

/**
 * Deliver an outbound row to the external provider. Return the external message
 * id to round-trip (marks the row replicated); return `null`/`undefined` to
 * leave it un-replicated so it is retried on the next emission. All the
 * provider-specific resolution (integration lookup, channel/webhook, formatting)
 * lives inside this callback — the framework owns only the replication plumbing.
 */
type Deliver<T> = (row: T) => Promise<string | null | undefined>;

export interface OutboundReplicationOptions {
  store: LiveStateStore;
  fetchClient: LiveStateFetchClient;
  /**
   * `externalOrigin` / `replicatedStr` key for this connector (e.g. `"discord"`).
   * Matches the thread's origin and namespaces the replicated marker.
   */
  provider: string;
  /**
   * Extra constraints merged into the `thread` sub-filter of both queries (e.g.
   * slack also requires `externalMetadataStr: { $not: null }`).
   */
  threadFilter?: Record<string, unknown>;
  deliverMessage: Deliver<OutboundMessage>;
  deliverUpdate: Deliver<OutboundUpdate>;
}

/**
 * Normalized outbound-subscription helper: the pull-deliver loop that every
 * support-entry-point connector runs. It watches un-replicated outbound messages
 * and thread updates for this provider, hands each to the connector's deliver
 * callback, and round-trips the external id (`message.setExternalMessageId` /
 * `update.markReplicated`) so connectors stop re-implementing the plumbing.
 *
 * Runs an initial `.get()` pass, then subscribes for live updates.
 */
export const startOutboundReplication = async ({
  store,
  fetchClient,
  provider,
  threadFilter = {},
  deliverMessage,
  deliverUpdate,
}: OutboundReplicationOptions) => {
  // Provider invariants are spread last so a caller-supplied `threadFilter`
  // cannot override `externalOrigin`/`externalId` and pull another provider's rows.
  const threadWhere = {
    ...threadFilter,
    externalId: { $not: null },
    externalOrigin: provider,
  };

  // In-flight guards: a delivery can outlive the next emission of the same row,
  // and rows are marked replicated via the async fetch client, so dedup here.
  const handlingMessages = new Set<string>();
  const handlingUpdates = new Set<string>();

  const handleMessages = async (messages: OutboundMessage[]) => {
    for (const message of messages) {
      if (handlingMessages.has(message.id)) {
        continue;
      }

      handlingMessages.add(message.id);
      try {
        const externalMessageId = await deliverMessage(message);
        if (externalMessageId) {
          store.mutate.message.setExternalMessageId({
            externalMessageId,
            messageId: message.id,
          });
        }
      } catch (error) {
        console.error("[outbound] message delivery failed:", error);
      } finally {
        handlingMessages.delete(message.id);
      }
    }
  };

  const handleUpdates = async (updates: OutboundUpdate[]) => {
    for (const update of updates) {
      let replicated: Record<string, unknown> = {};
      if (update.replicatedStr) {
        try {
          replicated = replicatedSchema.parse(JSON.parse(update.replicatedStr));
        } catch (error) {
          // A malformed row must not reject the whole pass — skip it.
          console.error("[outbound] invalid replicatedStr, skipping:", error);
          continue;
        }
      }
      if (replicated[provider]) {
        continue;
      }
      if (handlingUpdates.has(update.id)) {
        continue;
      }

      handlingUpdates.add(update.id);
      try {
        const externalMessageId = await deliverUpdate(update);
        if (externalMessageId) {
          await fetchClient.mutate.update.markReplicated({
            replicatedStr: JSON.stringify({
              ...replicated,
              [provider]: externalMessageId,
            }),
            updateId: update.id,
          });
        }
      } catch (error) {
        console.error("[outbound] update delivery failed:", error);
      } finally {
        handlingUpdates.delete(update.id);
      }
    }
  };

  const messageQuery = store.query.message
    .where({ externalMessageId: null, thread: threadWhere })
    .include({ author: { include: { user: true } }, thread: true });

  // TODO Subscribe callback is not being triggered with current values - track
  // https://github.com/pedroscosta/live-state/issues/82
  await handleMessages(await messageQuery.get());
  messageQuery.subscribe(handleMessages);

  const updateQuery = store.query.update
    .where({ thread: threadWhere })
    .include({ thread: true, user: true });

  await handleUpdates(await updateQuery.get());
  updateQuery.subscribe(handleUpdates);
};
