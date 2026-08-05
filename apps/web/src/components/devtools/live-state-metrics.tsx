"use client";

import type { ClientEvents } from "@live-state/sync/client";
import { useSyncExternalStore } from "react";

import { client } from "~/lib/live-state";

import { Sparkline } from "./sparkline";

const BUCKET_DURATION_MS = 1000;
const MAX_BUCKETS = 30;
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

export interface LiveStateDevtoolsSnapshot {
  events: readonly LiveStateLogEntry[];
  metrics: LiveStateMetrics;
}

interface LogEventData {
  data?: unknown;
  type: LiveStateLogEventType;
}

type MutableMetricBucket = LiveStateMetricBucket;

const emptySnapshot: LiveStateDevtoolsSnapshot = {
  events: [],
  metrics: {
    history: [],
    queryUpdates: 0,
    received: 0,
    sent: 0,
  },
};

let snapshot = emptySnapshot;
let events: LiveStateLogEntry[] = [];
let nextEventId = 0;
let sent = 0;
let received = 0;
let queryUpdates = 0;
let bucketStart: number | null = null;
let buckets: MutableMetricBucket[] = [];
let snapshotDirty = false;
let eventUnsubscribe: (() => void) | null = null;
let updateTimer: ReturnType<typeof setInterval> | null = null;
const subscribers = new Set<() => void>();

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
  const bucketChanged = advanceBuckets(now);
  const logEvent = getLogEventData(event);

  switch (event.type) {
    case "MESSAGE_SENT": {
      sent += 1;
      getCurrentBucket().sent += 1;
      break;
    }
    case "MESSAGE_RECEIVED": {
      received += 1;
      getCurrentBucket().received += 1;
      break;
    }
    case "QUERY_SUBSCRIPTION_TRIGGERED": {
      queryUpdates += 1;
      getCurrentBucket().queryUpdates += 1;
      break;
    }
    default: {
      break;
    }
  }

  if (!bucketChanged && !logEvent) {
    return;
  }

  if (logEvent) {
    events = [
      ...events,
      {
        data: logEvent.data,
        id: `event-${nextEventId++}`,
        timestamp: new Date(now),
        type: logEvent.type,
      },
    ];
  }

  snapshotDirty = true;
};

const flushSnapshot = () => {
  const bucketChanged = advanceBuckets(Date.now());
  if (!snapshotDirty && !bucketChanged) {
    return;
  }

  snapshot = {
    events: events.slice(),
    metrics: {
      history: buckets.map((bucket) => ({ ...bucket })),
      queryUpdates,
      received,
      sent,
    },
  };
  snapshotDirty = false;

  for (const subscriber of subscribers) {
    subscriber();
  }
};

const start = () => {
  if (typeof window === "undefined" || eventUnsubscribe) {
    return;
  }

  advanceBuckets(Date.now());
  eventUnsubscribe = client.addEventListener(handleClientEvent);
  updateTimer = setInterval(flushSnapshot, UPDATE_INTERVAL_MS);
  snapshotDirty = true;
  flushSnapshot();
};

const stop = () => {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }

  eventUnsubscribe?.();
  eventUnsubscribe = null;
};

const subscribe = (subscriber: () => void) => {
  subscribers.add(subscriber);
  start();

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) {
      stop();
    }
  };
};

const getSnapshot = () => snapshot;

export const useLiveStateDevtools = () =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

export const LiveStateMetrics = () => {
  const { metrics } = useLiveStateDevtools();
  const label = `Live-state WebSocket messages: ${metrics.sent} sent, ${metrics.received} received; ${metrics.queryUpdates} live-query UI updates`;

  return (
    <div aria-label={label} className="flex items-center gap-1" title={label}>
      <span className="text-foreground-secondary">WS:</span>
      <span className="text-orange-400">↑{metrics.sent}</span>
      <span className="text-blue-400">↓{metrics.received}</span>
      <span className="text-violet-400">UI:{metrics.queryUpdates}</span>
      <Sparkline
        className="h-4 w-14"
        min={0}
        series={[
          {
            color: "#fb923c",
            values: metrics.history.map((bucket) => bucket.sent),
          },
          {
            color: "#60a5fa",
            values: metrics.history.map((bucket) => bucket.received),
          },
          {
            color: "#a78bfa",
            values: metrics.history.map((bucket) => bucket.queryUpdates),
          },
        ]}
      />
    </div>
  );
};
