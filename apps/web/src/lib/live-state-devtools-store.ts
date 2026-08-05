import type { ClientEvents } from "@live-state/sync/client";

const BUCKET_DURATION_MS = 1000;
const MAX_BUCKETS = 30;
const MAX_LOG_ENTRIES = 1000;
const UPDATE_INTERVAL_MS = 250;

export type LiveStateLogEventType =
  | "close"
  | "data-load-reply"
  | "data-load-requested"
  | "message-received"
  | "message-sent"
  | "mutation-received"
  | "mutation-rejected"
  | "mutation-sent"
  | "open"
  | "optimistic-applied"
  | "optimistic-undone"
  | "query-executed"
  | "query-subscription-triggered"
  | "storage-loaded"
  | "store-updated"
  | "subscription-created"
  | "subscription-removed";

export interface LiveStateLogEntry {
  data?: unknown;
  id: string;
  timestamp: Date;
  type: LiveStateLogEventType;
}

export interface LiveStateMetricBucket {
  received: number;
  sent: number;
  timestamp: number;
  queryUpdates: number;
}

export interface LiveStateMetrics {
  history: readonly LiveStateMetricBucket[];
  queryUpdates: number;
  received: number;
  sent: number;
}

interface LiveStateClientEventSource {
  addEventListener: (listener: (event: ClientEvents) => void) => () => void;
}

interface LogEventData {
  data?: unknown;
  type: LiveStateLogEventType;
}

type MutableMetricBucket = LiveStateMetricBucket;

const emptyMetrics: LiveStateMetrics = {
  history: [],
  queryUpdates: 0,
  received: 0,
  sent: 0,
};

export interface LiveStateDevtoolsStore {
  getEventsSnapshot: () => readonly LiveStateLogEntry[];
  getMetricsSnapshot: () => LiveStateMetrics;
  subscribeEvents: (listener: () => void) => () => void;
  subscribeMetrics: (listener: () => void) => () => void;
}

export const createLiveStateDevtoolsStore = (
  client: LiveStateClientEventSource
): LiveStateDevtoolsStore => {
  const events: LiveStateLogEntry[] = [];
  let eventsSnapshot: readonly LiveStateLogEntry[] = [];
  let nextEventId = 0;
  let sent = 0;
  let received = 0;
  let queryUpdates = 0;
  let bucketStart: number | null = null;
  let buckets: MutableMetricBucket[] = [];
  let metricsSnapshot = emptyMetrics;
  let eventsDirty = false;
  let metricsDirty = false;
  let updateTimer: ReturnType<typeof setInterval> | null = null;
  const eventSubscribers = new Set<() => void>();
  const metricSubscribers = new Set<() => void>();

  const getBucketStart = (timestamp: number) =>
    Math.floor(timestamp / BUCKET_DURATION_MS) * BUCKET_DURATION_MS;

  const createBucket = (timestamp: number): MutableMetricBucket => ({
    received: 0,
    sent: 0,
    timestamp,
    queryUpdates: 0,
  });

  const advanceBuckets = (timestamp: number) => {
    const nextBucketStart = getBucketStart(timestamp);

    if (bucketStart === null) {
      bucketStart = nextBucketStart;
      buckets = [createBucket(nextBucketStart)];
      return true;
    }

    if (nextBucketStart <= bucketStart) {
      return false;
    }

    const firstBucketStart = Math.max(
      bucketStart + BUCKET_DURATION_MS,
      nextBucketStart - (MAX_BUCKETS - 1) * BUCKET_DURATION_MS
    );

    const newBuckets: MutableMetricBucket[] = [];
    for (
      let timestampForBucket = firstBucketStart;
      timestampForBucket <= nextBucketStart;
      timestampForBucket += BUCKET_DURATION_MS
    ) {
      newBuckets.push(createBucket(timestampForBucket));
    }

    buckets = [...buckets, ...newBuckets].slice(-MAX_BUCKETS);
    bucketStart = nextBucketStart;
    return true;
  };

  const getCurrentBucket = () => {
    const currentBucket = buckets.at(-1);
    if (!currentBucket) {
      throw new Error("Live-state metrics bucket has not been initialized");
    }
    return currentBucket;
  };

  const getLogEventData = (event: ClientEvents): LogEventData | null => {
    switch (event.type) {
      case "CONNECTION_STATE_CHANGE": {
        return {
          data: { open: event.open },
          type: event.open ? "open" : "close",
        };
      }
      case "MESSAGE_RECEIVED": {
        return { data: event.message, type: "message-received" };
      }
      case "MESSAGE_SENT": {
        return { data: event.message, type: "message-sent" };
      }
      case "CLIENT_STORAGE_LOADED": {
        return {
          data: { itemCount: event.itemCount, resource: event.resource },
          type: "storage-loaded",
        };
      }
      case "DATA_LOAD_REQUESTED": {
        return {
          data: {
            query: event.query,
            subscriptionId: event.subscriptionId,
          },
          type: "data-load-requested",
        };
      }
      case "DATA_LOAD_REPLY": {
        return {
          data: {
            itemCount: event.itemCount,
            resource: event.resource,
            subscriptionId: event.subscriptionId,
          },
          type: "data-load-reply",
        };
      }
      case "MUTATION_SENT": {
        return {
          data: {
            mutationId: event.mutationId,
            optimistic: event.optimistic,
            procedure: event.procedure,
            resource: event.resource,
            resourceId: event.resourceId,
          },
          type: "mutation-sent",
        };
      }
      case "MUTATION_RECEIVED": {
        return {
          data: {
            mutationId: event.mutationId,
            procedure: event.procedure,
            resource: event.resource,
            resourceId: event.resourceId,
          },
          type: "mutation-received",
        };
      }
      case "MUTATION_REJECTED": {
        return {
          data: {
            mutationId: event.mutationId,
            resource: event.resource,
          },
          type: "mutation-rejected",
        };
      }
      case "SUBSCRIPTION_CREATED": {
        return {
          data: {
            query: event.query,
            subscriberCount: event.subscriberCount,
            subscriptionKey: event.subscriptionKey,
          },
          type: "subscription-created",
        };
      }
      case "SUBSCRIPTION_REMOVED": {
        return {
          data: {
            query: event.query,
            subscriptionKey: event.subscriptionKey,
          },
          type: "subscription-removed",
        };
      }
      case "QUERY_EXECUTED": {
        return {
          data: {
            query: event.query,
            resultCount: event.resultCount,
          },
          type: "query-executed",
        };
      }
      case "QUERY_SUBSCRIPTION_TRIGGERED": {
        return {
          data: { query: event.query },
          type: "query-subscription-triggered",
        };
      }
      case "STORE_STATE_UPDATED": {
        return {
          data: {
            itemCount: event.itemCount,
            resource: event.resource,
          },
          type: "store-updated",
        };
      }
      case "OPTIMISTIC_MUTATION_APPLIED": {
        return {
          data: {
            mutationId: event.mutationId,
            pendingMutations: event.pendingMutations,
            procedure: event.procedure,
            resource: event.resource,
            resourceId: event.resourceId,
          },
          type: "optimistic-applied",
        };
      }
      case "OPTIMISTIC_MUTATION_UNDONE": {
        return {
          data: {
            mutationId: event.mutationId,
            pendingMutations: event.pendingMutations,
            resource: event.resource,
            resourceId: event.resourceId,
          },
          type: "optimistic-undone",
        };
      }
      default: {
        return null;
      }
    }
  };

  const handleClientEvent = (event: ClientEvents) => {
    const now = Date.now();
    if (advanceBuckets(now)) {
      metricsDirty = true;
    }

    switch (event.type) {
      case "MESSAGE_SENT": {
        sent += 1;
        getCurrentBucket().sent += 1;
        metricsDirty = true;
        break;
      }
      case "MESSAGE_RECEIVED": {
        received += 1;
        getCurrentBucket().received += 1;
        metricsDirty = true;
        break;
      }
      case "QUERY_SUBSCRIPTION_TRIGGERED": {
        queryUpdates += 1;
        getCurrentBucket().queryUpdates += 1;
        metricsDirty = true;
        break;
      }
      default: {
        break;
      }
    }

    const logEvent = getLogEventData(event);
    if (!logEvent) {
      return;
    }

    events.push({
      data: logEvent.data,
      id: `event-${nextEventId++}`,
      timestamp: new Date(now),
      type: logEvent.type,
    });
    if (events.length > MAX_LOG_ENTRIES) {
      events.splice(0, events.length - MAX_LOG_ENTRIES);
    }
    eventsDirty = true;
  };

  const flushSnapshot = () => {
    const metricsChanged = advanceBuckets(Date.now()) || metricsDirty;
    const eventsChanged = eventsDirty;

    if (!metricsChanged && !eventsChanged) {
      return;
    }

    if (metricsChanged) {
      metricsDirty = true;
      metricsSnapshot = {
        history: buckets.map((bucket) => ({ ...bucket })),
        queryUpdates,
        received,
        sent,
      };
      metricsDirty = false;
    }

    if (eventsChanged) {
      eventsSnapshot = events.slice();
      eventsDirty = false;
    }

    if (metricsChanged) {
      for (const subscriber of metricSubscribers) {
        subscriber();
      }
    }
    if (eventsChanged) {
      for (const subscriber of eventSubscribers) {
        subscriber();
      }
    }
  };

  const startTimer = () => {
    if (updateTimer || typeof window === "undefined") {
      return;
    }
    updateTimer = setInterval(flushSnapshot, UPDATE_INTERVAL_MS);
    flushSnapshot();
  };

  const stopTimer = () => {
    if (!updateTimer) {
      return;
    }
    clearInterval(updateTimer);
    updateTimer = null;
  };

  const subscribe = (
    subscribersForType: Set<() => void>,
    listener: () => void
  ) => {
    subscribersForType.add(listener);
    startTimer();

    return () => {
      subscribersForType.delete(listener);
      if (eventSubscribers.size === 0 && metricSubscribers.size === 0) {
        stopTimer();
      }
    };
  };

  if (typeof window !== "undefined") {
    client.addEventListener(handleClientEvent);
  }

  return {
    getEventsSnapshot: () => eventsSnapshot,
    getMetricsSnapshot: () => metricsSnapshot,
    subscribeEvents: (listener) => subscribe(eventSubscribers, listener),
    subscribeMetrics: (listener) => subscribe(metricSubscribers, listener),
  };
};
