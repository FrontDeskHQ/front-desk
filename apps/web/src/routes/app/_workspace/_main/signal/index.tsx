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
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { useAtomValue } from "jotai/react";
import { Check, Inbox, X } from "lucide-react";
import { useMemo } from "react";
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

  const suggestions = useLiveQuery(
    query.suggestion
      .where({
        type: "status",
        organizationId: currentOrg?.id,
        active: true,
      })
      .orderBy("createdAt", "desc"),
  ) as SuggestionRow[] | undefined;

  const resolvedSuggestions = useMemo(() => {
    if (!suggestions) return [];

    return suggestions.flatMap((s) => {
      if (!s.resultsStr) return [];
      try {
        const results = JSON.parse(s.resultsStr) as {
          suggestedStatus: number;
        };
        if (results.suggestedStatus !== 2) return [];
        return [
          {
            ...s,
            suggestedStatus: results.suggestedStatus,
          },
        ];
      } catch {
        return [];
      }
    });
  }, [suggestions]);

  const suggestionGroups = useMemo(
    () => groupSuggestions(resolvedSuggestions),
    [resolvedSuggestions],
  );

  const threadIds = useMemo(
    () => resolvedSuggestions.map((s) => s.entityId),
    [resolvedSuggestions],
  );

  const threads = useLiveQuery(
    query.thread.where({ id: { $in: threadIds } }).include({
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
  };

  const handleDismiss = (suggestion: ParsedSuggestion) => {
    mutate.suggestion.update(suggestion.id, {
      accepted: false,
      active: false,
      updatedAt: new Date(),
    });
  };

  const handleAcceptAll = (group: ParsedSuggestion[]) => {
    for (const suggestion of group) {
      handleAccept(suggestion);
    }
  };

  const handleDismissAll = (group: ParsedSuggestion[]) => {
    for (const suggestion of group) {
      handleDismiss(suggestion);
    }
  };

  const isEmpty = suggestionGroups.length === 0;

  return (
    <>
      <CardHeader className="flex items-center gap-2">Signal</CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 max-w-3xl w-full mx-auto">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center py-16 text-foreground-secondary">
              <Inbox className="size-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No suggestions</p>
              <p className="text-sm">
                When threads are ready to be resolved, they'll appear here.
              </p>
            </div>
          ) : (
            suggestionGroups.map((group) => (
              <SignalCard
                key={group[0].id}
                suggestions={group}
                threadsMap={threadsMap}
                onAccept={handleAccept}
                onDismiss={handleDismiss}
                onAcceptAll={() => handleAcceptAll(group)}
                onDismissAll={() => handleDismissAll(group)}
              />
            ))
          )}
        </div>
      </CardContent>
    </>
  );
}

type SignalCardProps = {
  suggestions: ParsedSuggestion[];
  threadsMap: Map<
    string,
    {
      id: string;
      name: string;
      author?: { name: string; user?: { image: string | null } | null } | null;
    }
  >;
  onAccept: (suggestion: ParsedSuggestion) => void;
  onDismiss: (suggestion: ParsedSuggestion) => void;
  onAcceptAll: () => void;
  onDismissAll: () => void;
};

function SignalCard({
  suggestions,
  threadsMap,
  onAccept,
  onDismiss,
  onAcceptAll,
  onDismissAll,
}: SignalCardProps) {
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
              {suggestions.length === 1
                ? "A thread that is likely resolved"
                : "Threads that are likely resolved"}
            </CardDescription>
          </div>
          <CardAction side="right" className="invisible group-hover:visible">
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
        </CardHeader>
        <CardContent className="p-0 gap-2">
          <div className="border flex items-center w-fit h-6 rounded-sm gap-1.5 px-2 has-[>svg:first-child]:pl-1.5 has-[>svg:last-child]:pr-1.5 text-xs bg-foreground-tertiary/15">
            <StatusIndicator status={2} />
            Resolved
          </div>
          <div className="flex flex-col gap-2 overflow-hidden -mt-1 pt-1">
            {suggestions.map((suggestion) => {
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
  onAccept: () => void;
  onDismiss: () => void;
};

function SuggestionItem({ thread, onAccept, onDismiss }: SuggestionItemProps) {
  if (!thread) return null;

  return (
    <div className="relative pl-7.5 group/nested-item flex gap-1.5">
      <div className="absolute left-[13px] -top-[28px] w-[13px] h-10 border-[#5C5C5C] border-b border-l rounded-bl-lg" />
      <div className="border flex items-center w-fit h-6 rounded-sm gap-1.5 px-2 has-[>svg:first-child]:pl-1.5 has-[>svg:last-child]:pr-1.5 text-xs bg-foreground-tertiary/15">
        <Avatar
          variant="user"
          size="sm"
          fallback={thread.author?.name}
          src={thread.author?.user?.image ?? undefined}
        />
        {thread.name}
      </div>
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
    </div>
  );
}
