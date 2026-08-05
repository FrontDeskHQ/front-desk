"use client";

import { useSyncExternalStore } from "react";

import { liveStateDevtoolsStore } from "~/lib/live-state";
import type { LiveStateLogEntry } from "~/lib/live-state-devtools-store";

import { Sparkline } from "./sparkline";

export type { LiveStateLogEntry };

export const useLiveStateEvents = () =>
  useSyncExternalStore(
    liveStateDevtoolsStore.subscribeEvents,
    liveStateDevtoolsStore.getEventsSnapshot,
    liveStateDevtoolsStore.getEventsSnapshot
  );

export const useLiveStateMetrics = () =>
  useSyncExternalStore(
    liveStateDevtoolsStore.subscribeMetrics,
    liveStateDevtoolsStore.getMetricsSnapshot,
    liveStateDevtoolsStore.getMetricsSnapshot
  );

export const LiveStateMetrics = () => {
  const metrics = useLiveStateMetrics();
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
