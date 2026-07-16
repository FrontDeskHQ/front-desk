import type { InferLiveObject } from "@live-state/sync";
import type { schema } from "api/schema";
import type { LiveStateFetchClient, LiveStateStore } from "./live-state";

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

export type OutboundReplicationOptions = {
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
};

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
  const threadWhere = {
    externalOrigin: provider,
    externalId: { $not: null },
    ...threadFilter,
  };

  const handleMessages = async (messages: OutboundMessage[]) => {
    for (const message of messages) {
      try {
        const externalMessageId = await deliverMessage(message);
        if (externalMessageId) {
          store.mutate.message.setExternalMessageId({
            messageId: message.id,
            externalMessageId,
          });
        }
      } catch (error) {
        console.error("[outbound] message delivery failed:", error);
      }
    }
  };

  // In-flight guard: a delivery can outlive the next emission of the same row,
  // and updates are marked replicated via the async fetch client, so dedup here.
  const handlingUpdates = new Set<string>();

  const handleUpdates = async (updates: OutboundUpdate[]) => {
    for (const update of updates) {
      const replicated = update.replicatedStr
        ? JSON.parse(update.replicatedStr)
        : {};
      if (replicated[provider]) continue;
      if (handlingUpdates.has(update.id)) continue;

      handlingUpdates.add(update.id);
      try {
        const externalMessageId = await deliverUpdate(update);
        if (externalMessageId) {
          await fetchClient.mutate.update.markReplicated({
            updateId: update.id,
            replicatedStr: JSON.stringify({
              ...replicated,
              [provider]: externalMessageId,
            }),
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
    .include({ thread: true, author: { include: { user: true } } });

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
