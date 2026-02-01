import { useLiveQuery } from "@live-state/sync/client";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import { ActionButton } from "@workspace/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  StatusIndicator,
  statusValues,
} from "@workspace/ui/components/indicator";
import { Separator } from "@workspace/ui/components/separator";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { useAtomValue } from "jotai/react";
import { Activity, Check, X } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useEffect, useMemo, useState } from "react";
import { ulid } from "ulid";
import { activeOrganizationAtom } from "~/lib/atoms";
import { mutate, query } from "~/lib/live-state";

export const Route = createFileRoute("/app/_workspace/_main/signal/")({
  component: RouteComponent,
});

type SuggestionRow = {
  id: string;
  entityId: string;
  relatedEntityId: string | null;
  active: boolean;
  accepted: boolean;
  resultsStr: string | null;
  metadataStr: string | null;
  createdAt: Date;
};

type ParsedSuggestion = SuggestionRow & {
  suggestedStatus: number;
};

function groupSuggestions(
  suggestions: ParsedSuggestion[],
): ParsedSuggestion[][] {
  const groups: ParsedSuggestion[][] = [];
  let currentGroup: ParsedSuggestion[] = [];

  for (const suggestion of suggestions) {
    if (currentGroup.length === 0) {
      currentGroup.push(suggestion);
      continue;
    }

    const newestInGroup = currentGroup[0];
    const newestTime = new Date(newestInGroup.createdAt).getTime();
    const currentTime = new Date(suggestion.createdAt).getTime();
    const daysDiff = (newestTime - currentTime) / (1000 * 60 * 60 * 24);

    if (daysDiff <= 15 && currentGroup.length < 5) {
      currentGroup.push(suggestion);
    } else {
      groups.push(currentGroup);
      currentGroup = [suggestion];
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

function RouteComponent() {
  const { user } = getRouteApi("/app").useRouteContext();
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const posthog = usePostHog();

  // Track locally accepted suggestions (within this session)
  const [locallyAccepted, setLocallyAccepted] = useState<
    Map<string, ParsedSuggestion>
  >(new Map());

  // Reset locally accepted when org changes so allThreadIds stays scoped to current tenant
  useEffect(() => {
    setLocallyAccepted(new Map());
  }, [currentOrg?.id]);

  // Query active (pending) suggestions
  const pendingSuggestions = useLiveQuery(
    query.suggestion
      .where({
        type: "status",
        organizationId: currentOrg?.id,
        active: true,
      })
      .orderBy("createdAt", "desc"),
  ) as SuggestionRow[] | undefined;

  // Query already accepted suggestions (for after page refresh)
  const acceptedSuggestions = useLiveQuery(
    query.suggestion
      .where({
        type: "status",
        organizationId: currentOrg?.id,
        active: false,
        accepted: true,
      })
      .orderBy("createdAt", "desc"),
  ) as SuggestionRow[] | undefined;

  const parseSuggestions = (
    suggestions: SuggestionRow[] | undefined,
  ): ParsedSuggestion[] => {
    if (!suggestions) return [];
    return suggestions.flatMap((s) => {
      if (!s.resultsStr) return [];
      try {
        const results = JSON.parse(s.resultsStr) as {
          suggestedStatus: number;
        };
        if (results.suggestedStatus !== 2) return [];
        return [{ ...s, suggestedStatus: results.suggestedStatus }];
      } catch {
        return [];
      }
    });
  };

  const resolvedPendingSuggestions = useMemo(
    () => parseSuggestions(pendingSuggestions),
    [pendingSuggestions],
  );

  const resolvedAcceptedSuggestions = useMemo(
    () => parseSuggestions(acceptedSuggestions),
    [acceptedSuggestions],
  );

  // Combine pending + locally accepted for grouping (so accepted stay in their original groups)
  const combinedForGrouping = useMemo(() => {
    const locallyAcceptedArr = Array.from(locallyAccepted.values());
    // Merge pending with locally accepted, sort by createdAt desc
    return [...resolvedPendingSuggestions, ...locallyAcceptedArr].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [resolvedPendingSuggestions, locallyAccepted]);

  // Groups that contain pending and/or locally accepted suggestions
  const activeGroups = useMemo(
    () => groupSuggestions(combinedForGrouping),
    [combinedForGrouping],
  );

  // Group already accepted suggestions (from DB, shown after refresh)
  // Exclude locally accepted ones since they're shown in their original cards
  const acceptedGroups = useMemo(() => {
    const nonLocallyAccepted = resolvedAcceptedSuggestions.filter(
      (s) => !locallyAccepted.has(s.id),
    );
    return groupSuggestions(nonLocallyAccepted);
  }, [resolvedAcceptedSuggestions, locallyAccepted]);

  // Collect all thread IDs we need
  const allThreadIds = useMemo(() => {
    const pending = resolvedPendingSuggestions.map((s) => s.entityId);
    const accepted = resolvedAcceptedSuggestions.map((s) => s.entityId);
    const local = Array.from(locallyAccepted.values()).map((s) => s.entityId);
    return [...new Set([...pending, ...accepted, ...local])];
  }, [
    resolvedPendingSuggestions,
    resolvedAcceptedSuggestions,
    locallyAccepted,
  ]);

  const threads = useLiveQuery(
    query.thread
      .where({
        id: { $in: allThreadIds },
        organizationId: currentOrg?.id,
      })
      .include({
        author: {
          user: true,
        },
      }),
  );

  const threadsMap = useMemo(() => {
    const map = new Map<string, (typeof threads)[number]>();
    for (const thread of threads ?? []) {
      map.set(thread.id, thread);
    }
    return map;
  }, [threads]);

  const handleAccept = (suggestion: ParsedSuggestion) => {
    if (!currentOrg) return;

    const thread = threadsMap.get(suggestion.entityId);
    if (!thread) return;

    // Store locally before mutation so we can show it after separator
    setLocallyAccepted((prev) => new Map(prev).set(suggestion.id, suggestion));

    const oldStatus = thread.status;
    const newStatus = suggestion.suggestedStatus;
    const oldStatusLabel = statusValues[oldStatus]?.label ?? "Unknown";
    const newStatusLabel = statusValues[newStatus]?.label ?? "Unknown";

    mutate.thread.update(suggestion.entityId, {
      status: newStatus,
    });

    mutate.update.insert({
      id: ulid().toLowerCase(),
      threadId: suggestion.entityId,
      type: "status_changed",
      createdAt: new Date(),
      userId: user.id,
      metadataStr: JSON.stringify({
        oldStatus,
        newStatus,
        oldStatusLabel,
        newStatusLabel,
        userName: user.name,
        source: "signal",
      }),
      replicatedStr: JSON.stringify({}),
    });

    mutate.suggestion.update(suggestion.id, {
      accepted: true,
      active: false,
      updatedAt: new Date(),
    });

    posthog?.capture("signal:suggestion_accept", {
      thread_id: suggestion.entityId,
      suggestion_id: suggestion.id,
      organization_id: currentOrg?.id,
    });
  };

  const handleDismiss = (suggestion: ParsedSuggestion) => {
    mutate.suggestion.update(suggestion.id, {
      accepted: false,
      active: false,
      updatedAt: new Date(),
    });

    posthog?.capture("signal:suggestion_dismiss", {
      thread_id: suggestion.entityId,
      suggestion_id: suggestion.id,
      organization_id: currentOrg?.id,
    });
  };

  const handleAcceptAll = (pendingInGroup: ParsedSuggestion[]) => {
    posthog?.capture("signal:suggestion_accept_all", {
      count: pendingInGroup.length,
      thread_ids: pendingInGroup.map((s) => s.entityId),
      organization_id: currentOrg?.id,
    });
    for (const suggestion of pendingInGroup) {
      handleAccept(suggestion);
    }
  };

  const handleDismissAll = (pendingInGroup: ParsedSuggestion[]) => {
    posthog?.capture("signal:suggestion_dismiss_all", {
      count: pendingInGroup.length,
      thread_ids: pendingInGroup.map((s) => s.entityId),
      organization_id: currentOrg?.id,
    });
    for (const suggestion of pendingInGroup) {
      handleDismiss(suggestion);
    }
  };

  // Split a group into pending and locally accepted
  const splitGroup = (
    group: ParsedSuggestion[],
  ): { pending: ParsedSuggestion[]; accepted: ParsedSuggestion[] } => {
    const pending: ParsedSuggestion[] = [];
    const accepted: ParsedSuggestion[] = [];
    for (const s of group) {
      if (locallyAccepted.has(s.id)) {
        accepted.push(s);
      } else {
        pending.push(s);
      }
    }
    return { pending, accepted };
  };

  const hasActiveGroups = activeGroups.length > 0;
  const hasAcceptedGroups = acceptedGroups.length > 0;
  const isEmpty = !hasActiveGroups && !hasAcceptedGroups;

  return (
    <>
      <CardHeader className="flex items-center gap-2">Signal</CardHeader>
      <CardContent className="flex flex-1 min-h-0 flex-col gap-4">
        <div
          className={`flex flex-col gap-4 max-w-3xl w-full mx-auto ${isEmpty ? "flex-1 min-h-0" : ""}`}
        >
          {isEmpty ? (
            <div className="flex flex-1 flex-col items-center justify-center py-16 text-foreground-secondary">
              <Activity className="size-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No signals</p>
              <p className="text-sm">
                As threads are created, they'll be analyzed and suggestions will
                appear here.
              </p>
            </div>
          ) : (
            <>
              {activeGroups.map((group) => {
                const { pending, accepted } = splitGroup(group);
                return (
                  <SignalCard
                    key={group[0].id}
                    pendingSuggestions={pending}
                    acceptedSuggestions={accepted}
                    threadsMap={threadsMap}
                    onAccept={handleAccept}
                    onDismiss={handleDismiss}
                    onAcceptAll={() => handleAcceptAll(pending)}
                    onDismissAll={() => handleDismissAll(pending)}
                  />
                );
              })}

              {hasAcceptedGroups && (
                <div className="flex items-center gap-3 text-foreground-secondary text-sm">
                  <Separator className="flex-1" />
                  <span className="whitespace-nowrap shrink-0 text-xs">
                    {hasActiveGroups
                      ? "Applied suggestions"
                      : "You're all caught up"}
                  </span>
                  <Separator className="flex-1" />
                </div>
              )}

              {acceptedGroups.map((group) => (
                <SignalCard
                  key={group[0].id}
                  pendingSuggestions={[]}
                  acceptedSuggestions={group}
                  threadsMap={threadsMap}
                  onAccept={handleAccept}
                  onDismiss={handleDismiss}
                  onAcceptAll={() => {}}
                  onDismissAll={() => {}}
                  isAcceptedCard
                />
              ))}
            </>
          )}
        </div>
      </CardContent>
    </>
  );
}

type SignalCardProps = {
  pendingSuggestions: ParsedSuggestion[];
  acceptedSuggestions: ParsedSuggestion[];
  threadsMap: Map<
    string,
    {
      id: string;
      name: string;
      status: number;
      author?: { name: string; user?: { image: string | null } | null } | null;
    }
  >;
  onAccept: (suggestion: ParsedSuggestion) => void;
  onDismiss: (suggestion: ParsedSuggestion) => void;
  onAcceptAll: () => void;
  onDismissAll: () => void;
  isAcceptedCard?: boolean;
};

function SignalCard({
  pendingSuggestions,
  acceptedSuggestions,
  threadsMap,
  onAccept,
  onDismiss,
  onAcceptAll,
  onDismissAll,
  isAcceptedCard = false,
}: SignalCardProps) {
  const hasPending = pendingSuggestions.length > 0;
  const hasAccepted = acceptedSuggestions.length > 0;
  const totalCount = pendingSuggestions.length + acceptedSuggestions.length;

  return (
    <Card className="p-4 group gap-4">
      <TooltipProvider>
        <CardHeader variant="transparent" className="border-0 px-0">
          <div className="space-y-1">
            <CardTitle>
              <Check className="size-4 text-foreground-secondary dark:text-foreground-secondary" />{" "}
              Mark as resolved
            </CardTitle>
            <CardDescription>
              {totalCount === 1
                ? "A thread that is likely resolved"
                : "Threads that are likely resolved"}
            </CardDescription>
          </div>
          {hasPending && !isAcceptedCard && (
            <CardAction side="right">
              <ActionButton
                variant="ghost"
                size="icon"
                tooltip="Apply all"
                onClick={onAcceptAll}
              >
                <Check />
              </ActionButton>
              <ActionButton
                variant="ghost"
                size="icon"
                tooltip="Dismiss all"
                onClick={onDismissAll}
              >
                <X />
              </ActionButton>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="p-0 gap-2">
          <div className="border flex items-center w-fit h-6 rounded-sm gap-1.5 px-2 has-[>svg:first-child]:pl-1.5 has-[>svg:last-child]:pr-1.5 text-xs bg-foreground-tertiary/15">
            <StatusIndicator status={2} />
            Resolved
          </div>
          <div className="flex flex-col gap-2 overflow-hidden -mt-1 pt-1">
            {/* Pending suggestions */}
            {pendingSuggestions.map((suggestion) => {
              const thread = threadsMap.get(suggestion.entityId);
              return (
                <SuggestionItem
                  key={suggestion.id}
                  suggestion={suggestion}
                  thread={thread}
                  onAccept={() => onAccept(suggestion)}
                  onDismiss={() => onDismiss(suggestion)}
                />
              );
            })}

            {/* Separator between pending and accepted */}
            {hasPending && hasAccepted && (
              <div className="flex items-center gap-3 text-foreground-secondary text-xs mt-2 mb-1 pl-7.5">
                <span className="whitespace-nowrap text-xs">
                  {acceptedSuggestions.length === 1
                    ? "Applied suggestion"
                    : "Applied suggestions"}
                </span>
                <Separator className="flex-1" />
              </div>
            )}

            {/* Accepted suggestions */}
            {acceptedSuggestions.map((suggestion) => {
              const thread = threadsMap.get(suggestion.entityId);
              return (
                <SuggestionItem
                  key={suggestion.id}
                  suggestion={suggestion}
                  thread={thread}
                  isAccepted
                />
              );
            })}
          </div>
        </CardContent>
      </TooltipProvider>
    </Card>
  );
}

type SuggestionItemProps = {
  suggestion: ParsedSuggestion;
  thread?: {
    id: string;
    name: string;
    author?: { name: string; user?: { image: string | null } | null } | null;
  } | null;
  onAccept?: () => void;
  onDismiss?: () => void;
  isAccepted?: boolean;
};

function SuggestionItem({
  thread,
  onAccept,
  onDismiss,
  isAccepted = false,
}: SuggestionItemProps) {
  if (!thread) return null;

  return (
    <div className="relative pl-7.5 group/nested-item flex gap-1.5">
      <div className="absolute left-[13px] -top-[64px] w-[13px] h-19 border-[#5C5C5C] border-b border-l rounded-bl-lg" />
      <div
        className={`border flex items-center w-fit h-6 rounded-sm gap-1.5 px-2 has-[>svg:first-child]:pl-1.5 has-[>svg:last-child]:pr-1.5 text-xs bg-foreground-tertiary/15 ${isAccepted ? "opacity-50" : ""}`}
      >
        <Avatar
          variant="user"
          size="sm"
          fallback={thread.author?.name}
          src={thread.author?.user?.image ?? undefined}
        />
        {thread.name}
      </div>
      {!isAccepted && onAccept && onDismiss && (
        <div className="flex gap-1 opacity-0 group-hover/nested-item:opacity-100 transition-opacity group-hover/nested-item:duration-0">
          <ActionButton
            variant="ghost"
            size="icon-sm"
            tooltip="Apply"
            onClick={onAccept}
          >
            <Check />
          </ActionButton>
          <ActionButton
            variant="ghost"
            size="icon-sm"
            tooltip="Dismiss"
            onClick={onDismiss}
          >
            <X />
          </ActionButton>
        </div>
      )}
      {isAccepted && (
        <div className="flex items-center gap-0.5">
          <Check className="size-4 text-foreground-secondary" />
          <div className="text-foreground-secondary text-xs">Applied</div>
        </div>
      )}
    </div>
  );
}
