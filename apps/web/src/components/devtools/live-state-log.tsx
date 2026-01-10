"use client";

import { Button } from "@workspace/ui/components/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@workspace/ui/components/drawer";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { client } from "~/lib/live-state";

type EventLogEntry = {
  id: string;
  timestamp: Date;
  type:
    | "open"
    | "close"
    | "message-received"
    | "storage-loaded"
    | "data-load-requested"
    | "data-load-reply"
    | "mutation-sent"
    | "mutation-received"
    | "mutation-rejected"
    | "subscription-created"
    | "subscription-removed"
    | "query-executed"
    | "store-updated"
    | "optimistic-applied"
    | "optimistic-undone";
  data?: unknown;
};

export const LiveStateLog = () => {
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const eventIdRef = useRef(0);

  useEffect(() => {
    const addEvent = (type: EventLogEntry["type"], data?: unknown) => {
      setEvents((prev) => [
        ...prev,
        {
          id: `event-${eventIdRef.current++}`,
          timestamp: new Date(),
          type,
          data,
        },
      ]);
    };

    const unsubscribe = client.addEventListener((event) => {
      switch (event.type) {
        case "CONNECTION_STATE_CHANGE":
          addEvent(event.open ? "open" : "close", { open: event.open });
          break;
        case "MESSAGE_RECEIVED":
          addEvent("message-received", event.message);
          break;
        case "CLIENT_STORAGE_LOADED":
          addEvent("storage-loaded", {
            resource: event.resource,
            itemCount: event.itemCount,
          });
          break;
        case "DATA_LOAD_REQUESTED":
          addEvent("data-load-requested", {
            query: event.query,
            subscriptionId: event.subscriptionId,
          });
          break;
        case "DATA_LOAD_REPLY":
          addEvent("data-load-reply", {
            resource: event.resource,
            itemCount: event.itemCount,
            subscriptionId: event.subscriptionId,
          });
          break;
        case "MUTATION_SENT":
          addEvent("mutation-sent", {
            mutationId: event.mutationId,
            resource: event.resource,
            resourceId: event.resourceId,
            procedure: event.procedure,
            optimistic: event.optimistic,
          });
          break;
        case "MUTATION_RECEIVED":
          addEvent("mutation-received", {
            mutationId: event.mutationId,
            resource: event.resource,
            resourceId: event.resourceId,
            procedure: event.procedure,
          });
          break;
        case "MUTATION_REJECTED":
          addEvent("mutation-rejected", {
            mutationId: event.mutationId,
            resource: event.resource,
          });
          break;
        case "SUBSCRIPTION_CREATED":
          addEvent("subscription-created", {
            query: event.query,
            subscriptionKey: event.subscriptionKey,
            subscriberCount: event.subscriberCount,
          });
          break;
        case "SUBSCRIPTION_REMOVED":
          addEvent("subscription-removed", {
            query: event.query,
            subscriptionKey: event.subscriptionKey,
          });
          break;
        case "QUERY_EXECUTED":
          addEvent("query-executed", {
            query: event.query,
            resultCount: event.resultCount,
          });
          break;
        case "STORE_STATE_UPDATED":
          addEvent("store-updated", {
            resource: event.resource,
            itemCount: event.itemCount,
          });
          break;
        case "OPTIMISTIC_MUTATION_APPLIED":
          addEvent("optimistic-applied", {
            mutationId: event.mutationId,
            resource: event.resource,
            resourceId: event.resourceId,
            procedure: event.procedure,
            pendingMutations: event.pendingMutations,
          });
          break;
        case "OPTIMISTIC_MUTATION_UNDONE":
          addEvent("optimistic-undone", {
            mutationId: event.mutationId,
            resource: event.resource,
            resourceId: event.resourceId,
            pendingMutations: event.pendingMutations,
          });
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isOpen && eventsEndRef.current) {
      eventsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [events, isOpen]);

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  };

  const getEventTypeColor = (type: EventLogEntry["type"]) => {
    switch (type) {
      case "open":
        return "text-green-500";
      case "close":
        return "text-yellow-500";
      case "message-received":
        return "text-blue-500";
      case "storage-loaded":
        return "text-cyan-500";
      case "data-load-requested":
        return "text-indigo-500";
      case "data-load-reply":
        return "text-purple-500";
      case "mutation-sent":
        return "text-orange-500";
      case "mutation-received":
        return "text-amber-500";
      case "mutation-rejected":
        return "text-red-500";
      case "subscription-created":
        return "text-emerald-500";
      case "subscription-removed":
        return "text-pink-500";
      case "query-executed":
        return "text-violet-500";
      case "store-updated":
        return "text-teal-500";
      case "optimistic-applied":
        return "text-lime-500";
      case "optimistic-undone":
        return "text-rose-500";
      default:
        return "text-foreground";
    }
  };

  const toggleEventExpansion = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const formatDataPreview = (data: unknown): string => {
    const jsonString = JSON.stringify(data);
    if (jsonString.length <= 100) {
      return jsonString;
    }
    return `${jsonString.slice(0, 97)}...`;
  };

  return (
    <Drawer open={isOpen} onOpenChange={setIsOpen} direction="bottom">
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 text-xs font-mono"
          aria-label="Show Live State event log"
        >
          live-state log
        </Button>
      </DrawerTrigger>
      <DrawerContent hideOverlay className="max-h-[50vh] h-[50vh]">
        <DrawerHeader className="border-b shrink-0">
          <DrawerTitle>Live State WebSocket Event Log</DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {events.length === 0 ? (
            <div className="text-muted-foreground text-sm text-center py-8">
              No events yet. Events will appear here when they occur.
            </div>
          ) : (
            events.map((event) => {
              const isExpanded = expandedEvents.has(event.id);
              const hasData = event.data !== undefined;

              return (
                <div
                  key={event.id}
                  className="flex gap-2 text-xs font-mono items-start"
                >
                  <span className="text-muted-foreground shrink-0">
                    {formatTimestamp(event.timestamp)}
                  </span>
                  <span
                    className={`shrink-0 font-semibold ${getEventTypeColor(event.type)}`}
                  >
                    [{event.type.toUpperCase()}]
                  </span>
                  {hasData ? (
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleEventExpansion(event.id)}
                        className="flex items-start gap-1.5 w-full text-left hover:bg-accent/50 rounded px-1 py-0.5 -mx-1 -my-0.5 transition-colors"
                        aria-label={
                          isExpanded ? "Collapse event" : "Expand event"
                        }
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-3 shrink-0 mt-0.5" />
                        ) : (
                          <ChevronRight className="size-3 shrink-0 mt-0.5" />
                        )}
                        {isExpanded ? (
                          <pre className="flex-1 overflow-x-auto text-xs whitespace-pre-wrap wrap-break-word">
                            {JSON.stringify(event.data, null, 2)}
                          </pre>
                        ) : (
                          <span className="flex-1 truncate text-xs">
                            {formatDataPreview(event.data)}
                          </span>
                        )}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
          <div ref={eventsEndRef} />
        </div>
        <div className="border-t shrink-0 p-2 flex justify-end">
          <DrawerClose asChild>
            <Button variant="outline" size="sm">
              Close
            </Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
