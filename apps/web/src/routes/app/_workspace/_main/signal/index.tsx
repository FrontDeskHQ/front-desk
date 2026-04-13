import type { InferLiveObject } from "@live-state/sync";
import { useLiveQuery } from "@live-state/sync/client";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
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
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import type { schema } from "api/schema";
import { useAtomValue } from "jotai/react";
import {
  Activity,
  Check,
  CheckCheck,
  Clock,
  CopySlash,
  GitPullRequest,
  X,
} from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useEffect, useMemo, useState } from "react";
import { ulid } from "ulid";
import { ThreadChip } from "~/components/chips";
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

type ParsedDuplicateSuggestion = SuggestionRow & {
  targetThreadId: string;
  confidence: string;
  reason: string;
  score: number;
};

type DuplicateGroup = {
  targetThreadId: string;
  suggestions: ParsedDuplicateSuggestion[];
};

type ParsedLinkedPrSuggestion = SuggestionRow & {
  prId: number;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  repo: string;
  confidence: number;
  reasoning: string;
};

type LinkedPrGroup = {
  prKey: string;
  prId: number;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  repo: string;
  suggestions: ParsedLinkedPrSuggestion[];
};

type ParsedPendingReplySuggestion = SuggestionRow & {
  lastMessageAt: string;
  thresholdMinutes: number;
};

type ParsedLoopToCloseSuggestion = SuggestionRow & {
  linkedPrId: string;
  prMergedAt: string;
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

function groupDuplicateSuggestions(
  suggestions: ParsedDuplicateSuggestion[],
): DuplicateGroup[] {
  // First: group by targetThreadId
  const byTarget = new Map<string, ParsedDuplicateSuggestion[]>();
  for (const s of suggestions) {
    const existing = byTarget.get(s.targetThreadId) ?? [];
    existing.push(s);
    byTarget.set(s.targetThreadId, existing);
  }

  // Second: within each target, apply time-based grouping
  const result: DuplicateGroup[] = [];
  for (const [targetThreadId, targetSuggestions] of byTarget) {
    // Sort by createdAt desc within target
    const sorted = [...targetSuggestions].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    // Apply time-based grouping (same logic as status suggestions)
    let currentGroup: ParsedDuplicateSuggestion[] = [];
    for (const suggestion of sorted) {
      if (currentGroup.length === 0) {
        currentGroup.push(suggestion);
        continue;
      }
      const newestTime = new Date(currentGroup[0].createdAt).getTime();
      const currentTime = new Date(suggestion.createdAt).getTime();
      const daysDiff = (newestTime - currentTime) / (1000 * 60 * 60 * 24);

      if (daysDiff <= 15 && currentGroup.length < 5) {
        currentGroup.push(suggestion);
      } else {
        result.push({ targetThreadId, suggestions: currentGroup });
        currentGroup = [suggestion];
      }
    }
    if (currentGroup.length > 0) {
      result.push({ targetThreadId, suggestions: currentGroup });
    }
  }

  // Sort groups by most recent suggestion
  return result.sort(
    (a, b) =>
      new Date(b.suggestions[0].createdAt).getTime() -
      new Date(a.suggestions[0].createdAt).getTime(),
  );
}

function groupLinkedPrSuggestions(
  suggestions: ParsedLinkedPrSuggestion[],
): LinkedPrGroup[] {
  // First: group by PR identity
  const byPr = new Map<string, ParsedLinkedPrSuggestion[]>();
  for (const s of suggestions) {
    const key = `${s.repo}#${s.prNumber}`;
    const existing = byPr.get(key) ?? [];
    existing.push(s);
    byPr.set(key, existing);
  }

  // Second: within each PR, apply time-based grouping
  const result: LinkedPrGroup[] = [];
  for (const [prKey, prSuggestions] of byPr) {
    const sorted = [...prSuggestions].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    let currentGroup: ParsedLinkedPrSuggestion[] = [];
    for (const suggestion of sorted) {
      if (currentGroup.length === 0) {
        currentGroup.push(suggestion);
        continue;
      }
      const newestTime = new Date(currentGroup[0].createdAt).getTime();
      const currentTime = new Date(suggestion.createdAt).getTime();
      const daysDiff = (newestTime - currentTime) / (1000 * 60 * 60 * 24);

      if (daysDiff <= 15 && currentGroup.length < 5) {
        currentGroup.push(suggestion);
      } else {
        const first = currentGroup[0];
        result.push({
          prKey,
          prId: first.prId,
          prNumber: first.prNumber,
          prTitle: first.prTitle,
          prUrl: first.prUrl,
          repo: first.repo,
          suggestions: currentGroup,
        });
        currentGroup = [suggestion];
      }
    }
    if (currentGroup.length > 0) {
      const first = currentGroup[0];
      result.push({
        prKey,
        prId: first.prId,
        prNumber: first.prNumber,
        prTitle: first.prTitle,
        prUrl: first.prUrl,
        repo: first.repo,
        suggestions: currentGroup,
      });
    }
  }

  return result.sort(
    (a, b) =>
      new Date(b.suggestions[0].createdAt).getTime() -
      new Date(a.suggestions[0].createdAt).getTime(),
  );
}

function RouteComponent() {
  const { user } = getRouteApi("/app").useRouteContext();
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const posthog = usePostHog();

  // Track locally accepted suggestions (within this session)
  const [locallyAccepted, setLocallyAccepted] = useState<
    Map<string, ParsedSuggestion>
  >(new Map());
  const [locallyAcceptedDuplicates, setLocallyAcceptedDuplicates] = useState<
    Map<string, ParsedDuplicateSuggestion>
  >(new Map());
  const [locallyAcceptedLinkedPrs, setLocallyAcceptedLinkedPrs] = useState<
    Map<string, ParsedLinkedPrSuggestion>
  >(new Map());

  // Reset locally accepted when org changes so allThreadIds stays scoped to current tenant
  useEffect(() => {
    setLocallyAccepted(new Map());
    setLocallyAcceptedDuplicates(new Map());
    setLocallyAcceptedLinkedPrs(new Map());
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

  // Query active duplicate suggestions
  const pendingDuplicateSuggestions = useLiveQuery(
    query.suggestion
      .where({
        type: "duplicate",
        organizationId: currentOrg?.id,
        active: true,
      })
      .orderBy("createdAt", "desc"),
  ) as SuggestionRow[] | undefined;

  // Query accepted duplicate suggestions
  const acceptedDuplicateSuggestions = useLiveQuery(
    query.suggestion
      .where({
        type: "duplicate",
        organizationId: currentOrg?.id,
        active: false,
        accepted: true,
      })
      .orderBy("createdAt", "desc"),
  ) as SuggestionRow[] | undefined;

  // Query active linked PR suggestions
  const pendingLinkedPrSuggestions = useLiveQuery(
    query.suggestion
      .where({
        type: "linked_pr",
        organizationId: currentOrg?.id,
        active: true,
      })
      .orderBy("createdAt", "desc"),
  ) as SuggestionRow[] | undefined;

  // Query accepted linked PR suggestions
  const acceptedLinkedPrSuggestions = useLiveQuery(
    query.suggestion
      .where({
        type: "linked_pr",
        organizationId: currentOrg?.id,
        active: false,
        accepted: true,
      })
      .orderBy("createdAt", "desc"),
  ) as SuggestionRow[] | undefined;

  // Query active "pending reply" digest signals
  const pendingReplySuggestions = useLiveQuery(
    query.suggestion
      .where({
        type: "digest:pending_reply",
        organizationId: currentOrg?.id,
        active: true,
      })
      .orderBy("createdAt", "desc"),
  ) as SuggestionRow[] | undefined;

  // Query active "loop to close" digest signals
  const loopToCloseSuggestions = useLiveQuery(
    query.suggestion
      .where({
        type: "digest:loop_to_close",
        organizationId: currentOrg?.id,
        active: true,
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

  const parseDuplicateSuggestions = (
    suggestions: SuggestionRow[] | undefined,
  ): ParsedDuplicateSuggestion[] => {
    if (!suggestions) return [];
    return suggestions.flatMap((s) => {
      if (!s.resultsStr || !s.relatedEntityId) return [];
      try {
        const results = JSON.parse(s.resultsStr) as {
          confidence: string;
          reason: string;
          score: number;
        };
        return [
          {
            ...s,
            targetThreadId: s.relatedEntityId,
            confidence: results.confidence,
            reason: results.reason,
            score: results.score,
          },
        ];
      } catch {
        return [];
      }
    });
  };

  const resolvedPendingDuplicates = useMemo(
    () => parseDuplicateSuggestions(pendingDuplicateSuggestions),
    [pendingDuplicateSuggestions],
  );

  const resolvedAcceptedDuplicates = useMemo(
    () => parseDuplicateSuggestions(acceptedDuplicateSuggestions),
    [acceptedDuplicateSuggestions],
  );

  // Combine pending + locally accepted duplicates for grouping
  const combinedDuplicatesForGrouping = useMemo(() => {
    const locallyAcceptedArr = Array.from(locallyAcceptedDuplicates.values());
    return [...resolvedPendingDuplicates, ...locallyAcceptedArr].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [resolvedPendingDuplicates, locallyAcceptedDuplicates]);

  // Active duplicate groups (pending and/or locally accepted)
  const activeDuplicateGroups = useMemo(
    () => groupDuplicateSuggestions(combinedDuplicatesForGrouping),
    [combinedDuplicatesForGrouping],
  );

  // Already accepted duplicate groups (from DB, after refresh)
  const acceptedDuplicateGroups = useMemo(() => {
    const nonLocallyAccepted = resolvedAcceptedDuplicates.filter(
      (s) => !locallyAcceptedDuplicates.has(s.id),
    );
    return groupDuplicateSuggestions(nonLocallyAccepted);
  }, [resolvedAcceptedDuplicates, locallyAcceptedDuplicates]);

  const parseLinkedPrSuggestions = (
    suggestions: SuggestionRow[] | undefined,
  ): ParsedLinkedPrSuggestion[] => {
    if (!suggestions) return [];
    return suggestions.flatMap((s) => {
      if (!s.resultsStr) return [];
      try {
        const results = JSON.parse(s.resultsStr) as {
          prId: number;
          prNumber: number;
          prTitle: string;
          prUrl: string;
          repo: string;
          confidence: number;
          reasoning: string;
        };
        if (!results.prId) return [];
        return [{ ...s, ...results }];
      } catch {
        return [];
      }
    });
  };

  const resolvedPendingLinkedPrs = useMemo(
    () => parseLinkedPrSuggestions(pendingLinkedPrSuggestions),
    [pendingLinkedPrSuggestions],
  );

  const resolvedAcceptedLinkedPrs = useMemo(
    () => parseLinkedPrSuggestions(acceptedLinkedPrSuggestions),
    [acceptedLinkedPrSuggestions],
  );

  const parsePendingReplySuggestions = (
    suggestions: SuggestionRow[] | undefined,
  ): ParsedPendingReplySuggestion[] => {
    if (!suggestions) return [];
    return suggestions.flatMap((s) => {
      if (!s.resultsStr) return [];
      try {
        const results = JSON.parse(s.resultsStr) as {
          lastMessageAt: string;
          thresholdMinutes: number;
        };
        if (!results.lastMessageAt) return [];
        return [
          {
            ...s,
            lastMessageAt: results.lastMessageAt,
            thresholdMinutes: results.thresholdMinutes,
          },
        ];
      } catch {
        return [];
      }
    });
  };

  const parseLoopToCloseSuggestions = (
    suggestions: SuggestionRow[] | undefined,
  ): ParsedLoopToCloseSuggestion[] => {
    if (!suggestions) return [];
    return suggestions.flatMap((s) => {
      if (!s.resultsStr) return [];
      try {
        const results = JSON.parse(s.resultsStr) as {
          linkedPrId: string;
          prMergedAt: string;
        };
        if (!results.linkedPrId || !results.prMergedAt) return [];
        return [
          {
            ...s,
            linkedPrId: results.linkedPrId,
            prMergedAt: results.prMergedAt,
          },
        ];
      } catch {
        return [];
      }
    });
  };

  // Pending reply signals sorted by wait time desc (oldest message first)
  const resolvedPendingReplies = useMemo(() => {
    const parsed = parsePendingReplySuggestions(pendingReplySuggestions);
    return [...parsed].sort(
      (a, b) =>
        new Date(a.lastMessageAt).getTime() -
        new Date(b.lastMessageAt).getTime(),
    );
  }, [pendingReplySuggestions]);

  // Loop-to-close signals sorted by merge time asc (oldest unannounced fix first)
  const resolvedLoopToClose = useMemo(() => {
    const parsed = parseLoopToCloseSuggestions(loopToCloseSuggestions);
    return [...parsed].sort(
      (a, b) =>
        new Date(a.prMergedAt).getTime() - new Date(b.prMergedAt).getTime(),
    );
  }, [loopToCloseSuggestions]);

  // Map linkedPrId -> accepted linked_pr suggestion, for exact PR match in loop-to-close rows
  const linkedPrByPrId = useMemo(() => {
    const map = new Map<string, ParsedLinkedPrSuggestion>();
    for (const s of resolvedAcceptedLinkedPrs) {
      const key = `github:${s.repo}#${s.prId}`;
      const existing = map.get(key);
      if (
        !existing ||
        new Date(s.createdAt).getTime() > new Date(existing.createdAt).getTime()
      ) {
        map.set(key, s);
      }
    }
    return map;
  }, [resolvedAcceptedLinkedPrs]);

  // Fallback: thread -> most recent accepted linked_pr suggestion
  const linkedPrByThreadId = useMemo(() => {
    const map = new Map<string, ParsedLinkedPrSuggestion>();
    for (const s of resolvedAcceptedLinkedPrs) {
      const existing = map.get(s.entityId);
      if (
        !existing ||
        new Date(s.createdAt).getTime() > new Date(existing.createdAt).getTime()
      ) {
        map.set(s.entityId, s);
      }
    }
    return map;
  }, [resolvedAcceptedLinkedPrs]);

  const combinedLinkedPrsForGrouping = useMemo(() => {
    const locallyAcceptedArr = Array.from(locallyAcceptedLinkedPrs.values());
    return [...resolvedPendingLinkedPrs, ...locallyAcceptedArr].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [resolvedPendingLinkedPrs, locallyAcceptedLinkedPrs]);

  const activeLinkedPrGroups = useMemo(
    () => groupLinkedPrSuggestions(combinedLinkedPrsForGrouping),
    [combinedLinkedPrsForGrouping],
  );

  const acceptedLinkedPrGroups = useMemo(() => {
    const nonLocallyAccepted = resolvedAcceptedLinkedPrs.filter(
      (s) => !locallyAcceptedLinkedPrs.has(s.id),
    );
    return groupLinkedPrSuggestions(nonLocallyAccepted);
  }, [resolvedAcceptedLinkedPrs, locallyAcceptedLinkedPrs]);

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

  // Collect all thread IDs we need (status + duplicate + linked PR suggestions)
  const allThreadIds = useMemo(() => {
    // Status suggestion thread IDs
    const pending = resolvedPendingSuggestions.map((s) => s.entityId);
    const accepted = resolvedAcceptedSuggestions.map((s) => s.entityId);
    const local = Array.from(locallyAccepted.values()).map((s) => s.entityId);

    // Duplicate suggestion thread IDs (both entityId and targetThreadId)
    const duplicatePending = resolvedPendingDuplicates.flatMap((s) => [
      s.entityId,
      s.targetThreadId,
    ]);
    const duplicateAccepted = resolvedAcceptedDuplicates.flatMap((s) => [
      s.entityId,
      s.targetThreadId,
    ]);
    const duplicateLocal = Array.from(
      locallyAcceptedDuplicates.values(),
    ).flatMap((s) => [s.entityId, s.targetThreadId]);

    // Linked PR suggestion thread IDs
    const linkedPrPending = resolvedPendingLinkedPrs.map((s) => s.entityId);
    const linkedPrAccepted = resolvedAcceptedLinkedPrs.map((s) => s.entityId);
    const linkedPrLocal = Array.from(locallyAcceptedLinkedPrs.values()).map(
      (s) => s.entityId,
    );

    // Digest signal thread IDs
    const pendingReplyIds = resolvedPendingReplies.map((s) => s.entityId);
    const loopToCloseIds = resolvedLoopToClose.map((s) => s.entityId);

    return [
      ...new Set([
        ...pending,
        ...accepted,
        ...local,
        ...duplicatePending,
        ...duplicateAccepted,
        ...duplicateLocal,
        ...linkedPrPending,
        ...linkedPrAccepted,
        ...linkedPrLocal,
        ...pendingReplyIds,
        ...loopToCloseIds,
      ]),
    ];
  }, [
    resolvedPendingSuggestions,
    resolvedAcceptedSuggestions,
    locallyAccepted,
    resolvedPendingDuplicates,
    resolvedAcceptedDuplicates,
    locallyAcceptedDuplicates,
    resolvedPendingLinkedPrs,
    resolvedAcceptedLinkedPrs,
    locallyAcceptedLinkedPrs,
    resolvedPendingReplies,
    resolvedLoopToClose,
  ]);

  const threads = useLiveQuery(
    query.thread
      .where({
        id: { $in: allThreadIds },
        organizationId: currentOrg?.id,
      })
      .include({
        author: {
          include: { user: true },
        },
        assignedUser: {
          include: { user: true },
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

  // Split a duplicate group into pending and locally accepted
  const splitDuplicateGroup = (
    suggestions: ParsedDuplicateSuggestion[],
  ): {
    pending: ParsedDuplicateSuggestion[];
    accepted: ParsedDuplicateSuggestion[];
  } => {
    const pending: ParsedDuplicateSuggestion[] = [];
    const accepted: ParsedDuplicateSuggestion[] = [];
    for (const s of suggestions) {
      if (locallyAcceptedDuplicates.has(s.id)) {
        accepted.push(s);
      } else {
        pending.push(s);
      }
    }
    return { pending, accepted };
  };

  const handleAcceptDuplicate = (suggestion: ParsedDuplicateSuggestion) => {
    if (!currentOrg) return;

    const thread = threadsMap.get(suggestion.entityId);
    const targetThread = threadsMap.get(suggestion.targetThreadId);
    if (!thread) return;

    // Store locally before mutation
    setLocallyAcceptedDuplicates((prev) =>
      new Map(prev).set(suggestion.id, suggestion),
    );

    // Set thread status to Duplicated (4)
    mutate.thread.update(suggestion.entityId, { status: 4 });

    // Create update record for the duplicate link
    mutate.update.insert({
      id: ulid().toLowerCase(),
      threadId: suggestion.entityId,
      type: "marked_duplicate",
      createdAt: new Date(),
      userId: user.id,
      metadataStr: JSON.stringify({
        duplicateOfThreadId: suggestion.targetThreadId,
        duplicateOfThreadName: targetThread?.name,
        userName: user.name,
        source: "signal",
      }),
      replicatedStr: JSON.stringify({}),
    });

    // Mark suggestion as accepted
    mutate.suggestion.update(suggestion.id, {
      accepted: true,
      active: false,
      updatedAt: new Date(),
    });

    posthog?.capture("signal:duplicate_accept", {
      thread_id: suggestion.entityId,
      target_thread_id: suggestion.targetThreadId,
      suggestion_id: suggestion.id,
      organization_id: currentOrg?.id,
    });
  };

  const handleDismissDuplicate = (suggestion: ParsedDuplicateSuggestion) => {
    mutate.suggestion.update(suggestion.id, {
      accepted: false,
      active: false,
      updatedAt: new Date(),
    });

    posthog?.capture("signal:duplicate_dismiss", {
      thread_id: suggestion.entityId,
      target_thread_id: suggestion.targetThreadId,
      suggestion_id: suggestion.id,
      organization_id: currentOrg?.id,
    });
  };

  const handleAcceptAllDuplicates = (
    pendingInGroup: ParsedDuplicateSuggestion[],
  ) => {
    posthog?.capture("signal:duplicate_accept_all", {
      count: pendingInGroup.length,
      thread_ids: pendingInGroup.map((s) => s.entityId),
      organization_id: currentOrg?.id,
    });
    for (const suggestion of pendingInGroup) {
      handleAcceptDuplicate(suggestion);
    }
  };

  const handleDismissAllDuplicates = (
    pendingInGroup: ParsedDuplicateSuggestion[],
  ) => {
    posthog?.capture("signal:duplicate_dismiss_all", {
      count: pendingInGroup.length,
      thread_ids: pendingInGroup.map((s) => s.entityId),
      organization_id: currentOrg?.id,
    });
    for (const suggestion of pendingInGroup) {
      handleDismissDuplicate(suggestion);
    }
  };

  const handleAcceptLinkedPr = (suggestion: ParsedLinkedPrSuggestion) => {
    if (!currentOrg) return;

    const thread = threadsMap.get(suggestion.entityId);
    if (!thread) return;

    setLocallyAcceptedLinkedPrs((prev) =>
      new Map(prev).set(suggestion.id, suggestion),
    );

    const externalPrId = `github:${suggestion.repo}#${suggestion.prId}`;
    const oldPrId = thread.externalPrId ?? null;

    mutate.thread.update(suggestion.entityId, { externalPrId });

    mutate.update.insert({
      id: ulid().toLowerCase(),
      threadId: suggestion.entityId,
      type: "pr_changed",
      createdAt: new Date(),
      userId: user.id,
      metadataStr: JSON.stringify({
        oldPrId,
        newPrId: externalPrId,
        oldPrLabel: null,
        newPrLabel: `${suggestion.repo}#${suggestion.prNumber}`,
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

    posthog?.capture("signal:linked_pr_accept", {
      thread_id: suggestion.entityId,
      suggestion_id: suggestion.id,
      pr_number: suggestion.prNumber,
      repo: suggestion.repo,
      organization_id: currentOrg?.id,
    });
  };

  const handleDismissLinkedPr = (suggestion: ParsedLinkedPrSuggestion) => {
    mutate.suggestion.update(suggestion.id, {
      accepted: false,
      active: false,
      updatedAt: new Date(),
    });

    posthog?.capture("signal:linked_pr_dismiss", {
      thread_id: suggestion.entityId,
      suggestion_id: suggestion.id,
      pr_number: suggestion.prNumber,
      repo: suggestion.repo,
      organization_id: currentOrg?.id,
    });
  };

  const handleAcceptAllLinkedPrs = (
    pendingInGroup: ParsedLinkedPrSuggestion[],
  ) => {
    posthog?.capture("signal:linked_pr_accept_all", {
      count: pendingInGroup.length,
      thread_ids: pendingInGroup.map((s) => s.entityId),
      organization_id: currentOrg?.id,
    });
    for (const suggestion of pendingInGroup) {
      handleAcceptLinkedPr(suggestion);
    }
  };

  const handleDismissAllLinkedPrs = (
    pendingInGroup: ParsedLinkedPrSuggestion[],
  ) => {
    posthog?.capture("signal:linked_pr_dismiss_all", {
      count: pendingInGroup.length,
      thread_ids: pendingInGroup.map((s) => s.entityId),
      organization_id: currentOrg?.id,
    });
    for (const suggestion of pendingInGroup) {
      handleDismissLinkedPr(suggestion);
    }
  };

  const handleDismissPendingReply = (
    suggestion: ParsedPendingReplySuggestion,
  ) => {
    mutate.suggestion.update(suggestion.id, {
      accepted: false,
      active: false,
      updatedAt: new Date(),
    });

    posthog?.capture("signal:digest_dismiss", {
      type: "digest:pending_reply",
      thread_id: suggestion.entityId,
      suggestion_id: suggestion.id,
      organization_id: currentOrg?.id,
    });
  };

  const handleDismissAllPendingReplies = (
    suggestions: ParsedPendingReplySuggestion[],
  ) => {
    posthog?.capture("signal:digest_dismiss_all", {
      type: "digest:pending_reply",
      count: suggestions.length,
      organization_id: currentOrg?.id,
    });
    for (const suggestion of suggestions) {
      handleDismissPendingReply(suggestion);
    }
  };

  const handleDismissLoopToClose = (
    suggestion: ParsedLoopToCloseSuggestion,
  ) => {
    mutate.suggestion.update(suggestion.id, {
      accepted: false,
      active: false,
      updatedAt: new Date(),
    });

    posthog?.capture("signal:digest_dismiss", {
      type: "digest:loop_to_close",
      thread_id: suggestion.entityId,
      suggestion_id: suggestion.id,
      organization_id: currentOrg?.id,
    });
  };

  const handleDismissAllLoopToClose = (
    suggestions: ParsedLoopToCloseSuggestion[],
  ) => {
    posthog?.capture("signal:digest_dismiss_all", {
      type: "digest:loop_to_close",
      count: suggestions.length,
      organization_id: currentOrg?.id,
    });
    for (const suggestion of suggestions) {
      handleDismissLoopToClose(suggestion);
    }
  };

  const splitLinkedPrGroup = (
    suggestions: ParsedLinkedPrSuggestion[],
  ): {
    pending: ParsedLinkedPrSuggestion[];
    accepted: ParsedLinkedPrSuggestion[];
  } => {
    const pending: ParsedLinkedPrSuggestion[] = [];
    const accepted: ParsedLinkedPrSuggestion[] = [];
    for (const s of suggestions) {
      if (locallyAcceptedLinkedPrs.has(s.id)) {
        accepted.push(s);
      } else {
        pending.push(s);
      }
    }
    return { pending, accepted };
  };

  const hasActiveGroups = activeGroups.length > 0;
  const hasAcceptedGroups = acceptedGroups.length > 0;
  const hasActiveDuplicateGroups = activeDuplicateGroups.length > 0;
  const hasAcceptedDuplicateGroups = acceptedDuplicateGroups.length > 0;
  const hasActiveLinkedPrGroups = activeLinkedPrGroups.length > 0;
  const hasAcceptedLinkedPrGroups = acceptedLinkedPrGroups.length > 0;
  const hasPendingReplies = resolvedPendingReplies.length > 0;
  const hasLoopToClose = resolvedLoopToClose.length > 0;
  const isEmpty =
    !hasPendingReplies &&
    !hasLoopToClose &&
    !hasActiveGroups &&
    !hasAcceptedGroups &&
    !hasActiveDuplicateGroups &&
    !hasAcceptedDuplicateGroups &&
    !hasActiveLinkedPrGroups &&
    !hasAcceptedLinkedPrGroups;

  return (
    <>
      <CardHeader className="flex items-center gap-2">Signals</CardHeader>
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
              {/* Waiting-for-reply digest card */}
              {hasPendingReplies && (
                <PendingReplySignalCard
                  suggestions={resolvedPendingReplies}
                  threadsMap={threadsMap}
                  onDismiss={handleDismissPendingReply}
                  onDismissAll={() =>
                    handleDismissAllPendingReplies(resolvedPendingReplies)
                  }
                />
              )}

              {/* Loop-to-close digest card */}
              {hasLoopToClose && (
                <LoopToCloseSignalCard
                  suggestions={resolvedLoopToClose}
                  threadsMap={threadsMap}
                  linkedPrByPrId={linkedPrByPrId}
                  linkedPrByThreadId={linkedPrByThreadId}
                  onDismiss={handleDismissLoopToClose}
                  onDismissAll={() =>
                    handleDismissAllLoopToClose(resolvedLoopToClose)
                  }
                />
              )}

              {/* Active status suggestion cards */}
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

              {/* Active duplicate suggestion cards */}
              {activeDuplicateGroups.map((group) => {
                const { pending, accepted } = splitDuplicateGroup(
                  group.suggestions,
                );
                return (
                  <DuplicateSignalCard
                    key={`dup-${group.targetThreadId}-${group.suggestions[0].id}`}
                    group={group}
                    pendingSuggestions={pending}
                    acceptedSuggestions={accepted}
                    threadsMap={threadsMap}
                    onAccept={handleAcceptDuplicate}
                    onDismiss={handleDismissDuplicate}
                    onAcceptAll={() => handleAcceptAllDuplicates(pending)}
                    onDismissAll={() => handleDismissAllDuplicates(pending)}
                  />
                );
              })}

              {/* Active linked PR suggestion cards */}
              {activeLinkedPrGroups.map((group) => {
                const { pending, accepted } = splitLinkedPrGroup(
                  group.suggestions,
                );
                return (
                  <LinkedPrSignalCard
                    key={`pr-${group.prKey}-${group.suggestions[0].id}`}
                    group={group}
                    pendingSuggestions={pending}
                    acceptedSuggestions={accepted}
                    threadsMap={threadsMap}
                    onAccept={handleAcceptLinkedPr}
                    onDismiss={handleDismissLinkedPr}
                    onAcceptAll={() => handleAcceptAllLinkedPrs(pending)}
                    onDismissAll={() => handleDismissAllLinkedPrs(pending)}
                  />
                );
              })}

              {/* Separator for accepted suggestions */}
              {(hasAcceptedGroups ||
                hasAcceptedDuplicateGroups ||
                hasAcceptedLinkedPrGroups) && (
                <div className="flex items-center gap-3 text-foreground-secondary text-sm">
                  <Separator className="flex-1" />
                  <span className="whitespace-nowrap shrink-0 text-xs">
                    {hasActiveGroups ||
                    hasActiveDuplicateGroups ||
                    hasActiveLinkedPrGroups ||
                    hasPendingReplies ||
                    hasLoopToClose
                      ? "Applied suggestions"
                      : "You're all caught up"}
                  </span>
                  <Separator className="flex-1" />
                </div>
              )}

              {/* Accepted status suggestion cards */}
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

              {/* Accepted duplicate suggestion cards */}
              {acceptedDuplicateGroups.map((group) => (
                <DuplicateSignalCard
                  key={`dup-accepted-${group.targetThreadId}-${group.suggestions[0].id}`}
                  group={group}
                  pendingSuggestions={[]}
                  acceptedSuggestions={group.suggestions}
                  threadsMap={threadsMap}
                  onAccept={handleAcceptDuplicate}
                  onDismiss={handleDismissDuplicate}
                  onAcceptAll={() => {}}
                  onDismissAll={() => {}}
                  isAcceptedCard
                />
              ))}

              {/* Accepted linked PR suggestion cards */}
              {acceptedLinkedPrGroups.map((group) => (
                <LinkedPrSignalCard
                  key={`pr-accepted-${group.prKey}-${group.suggestions[0].id}`}
                  group={group}
                  pendingSuggestions={[]}
                  acceptedSuggestions={group.suggestions}
                  threadsMap={threadsMap}
                  onAccept={handleAcceptLinkedPr}
                  onDismiss={handleDismissLinkedPr}
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
    InferLiveObject<
      typeof schema.thread,
      {
        author: { include: { user: true } };
        assignedUser: { include: { user: true } };
      }
    >
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
  thread?: InferLiveObject<
    typeof schema.thread,
    {
      author: { include: { user: true } };
      assignedUser: { include: { user: true } };
    }
  > | null;
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
      <ThreadChip
        thread={thread}
        render={<Link to="/app/threads/$id" params={{ id: thread.id }} />}
      />
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

type DuplicateSignalCardProps = {
  group: DuplicateGroup;
  pendingSuggestions: ParsedDuplicateSuggestion[];
  acceptedSuggestions: ParsedDuplicateSuggestion[];
  threadsMap: Map<
    string,
    InferLiveObject<
      typeof schema.thread,
      {
        author: { include: { user: true } };
        assignedUser: { include: { user: true } };
      }
    >
  >;
  onAccept: (suggestion: ParsedDuplicateSuggestion) => void;
  onDismiss: (suggestion: ParsedDuplicateSuggestion) => void;
  onAcceptAll: () => void;
  onDismissAll: () => void;
  isAcceptedCard?: boolean;
};

function DuplicateSignalCard({
  group,
  pendingSuggestions,
  acceptedSuggestions,
  threadsMap,
  onAccept,
  onDismiss,
  onAcceptAll,
  onDismissAll,
  isAcceptedCard = false,
}: DuplicateSignalCardProps) {
  const hasPending = pendingSuggestions.length > 0;
  const hasAccepted = acceptedSuggestions.length > 0;
  const totalCount = pendingSuggestions.length + acceptedSuggestions.length;
  const targetThread = threadsMap.get(group.targetThreadId);

  return (
    <Card className="p-4 group gap-4">
      <TooltipProvider>
        <CardHeader variant="transparent" className="border-0 px-0">
          <div className="space-y-1">
            <CardTitle>
              <CopySlash className="size-4 text-foreground-secondary dark:text-foreground-secondary" />{" "}
              Mark as duplicate
            </CardTitle>
            <CardDescription>
              {totalCount === 1
                ? "Possible duplicate of an existing thread"
                : "Possible duplicates of an existing thread"}
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
          {targetThread && (
            <ThreadChip
              thread={targetThread}
              render={
                <Link to="/app/threads/$id" params={{ id: targetThread.id }} />
              }
            />
          )}
          <div className="flex flex-col gap-2 overflow-hidden -mt-1 pt-1">
            {/* Pending suggestions */}
            {pendingSuggestions.map((suggestion) => {
              const thread = threadsMap.get(suggestion.entityId);
              return (
                <DuplicateSuggestionItem
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
                <DuplicateSuggestionItem
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

type DuplicateSuggestionItemProps = {
  suggestion: ParsedDuplicateSuggestion;
  thread?: InferLiveObject<
    typeof schema.thread,
    {
      author: { include: { user: true } };
      assignedUser: { include: { user: true } };
    }
  > | null;
  onAccept?: () => void;
  onDismiss?: () => void;
  isAccepted?: boolean;
};

function DuplicateSuggestionItem({
  thread,
  onAccept,
  onDismiss,
  isAccepted = false,
}: DuplicateSuggestionItemProps) {
  if (!thread) return null;

  return (
    <div className="relative pl-7.5 group/nested-item flex gap-1.5">
      <div className="absolute left-[13px] -top-[64px] w-[13px] h-19 border-[#5C5C5C] border-b border-l rounded-bl-lg" />
      <ThreadChip
        thread={thread}
        render={<Link to="/app/threads/$id" params={{ id: thread.id }} />}
      />
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

type LinkedPrSignalCardProps = {
  group: LinkedPrGroup;
  pendingSuggestions: ParsedLinkedPrSuggestion[];
  acceptedSuggestions: ParsedLinkedPrSuggestion[];
  threadsMap: Map<
    string,
    InferLiveObject<
      typeof schema.thread,
      {
        author: { include: { user: true } };
        assignedUser: { include: { user: true } };
      }
    >
  >;
  onAccept: (suggestion: ParsedLinkedPrSuggestion) => void;
  onDismiss: (suggestion: ParsedLinkedPrSuggestion) => void;
  onAcceptAll: () => void;
  onDismissAll: () => void;
  isAcceptedCard?: boolean;
};

function LinkedPrSignalCard({
  group,
  pendingSuggestions,
  acceptedSuggestions,
  threadsMap,
  onAccept,
  onDismiss,
  onAcceptAll,
  onDismissAll,
  isAcceptedCard = false,
}: LinkedPrSignalCardProps) {
  const hasPending = pendingSuggestions.length > 0;
  const hasAccepted = acceptedSuggestions.length > 0;
  const totalCount = pendingSuggestions.length + acceptedSuggestions.length;

  return (
    <Card className="p-4 group gap-4">
      <TooltipProvider>
        <CardHeader variant="transparent" className="border-0 px-0">
          <div className="space-y-1">
            <CardTitle>
              <GitPullRequest className="size-4 text-foreground-secondary dark:text-foreground-secondary" />{" "}
              Link pull request
            </CardTitle>
            <CardDescription>
              {totalCount === 1
                ? "A PR that may address this thread"
                : "A PR that may address these threads"}
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
          <a
            href={group.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="border flex items-center w-fit max-w-full h-6 rounded-sm gap-1.5 px-2 has-[>svg:first-child]:pl-1.5 text-xs bg-foreground-tertiary/15 hover:bg-foreground-tertiary/25 transition-colors"
          >
            <GitPullRequest className="size-3.5 shrink-0" />
            <span className="font-medium shrink-0">
              {group.repo}#{group.prNumber}
            </span>
            <span className="truncate text-foreground-secondary">
              {group.prTitle}
            </span>
          </a>
          <div className="flex flex-col gap-2 overflow-hidden -mt-1 pt-1">
            {/* Pending suggestions */}
            {pendingSuggestions.map((suggestion) => {
              const thread = threadsMap.get(suggestion.entityId);
              return (
                <LinkedPrSuggestionItem
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
                <LinkedPrSuggestionItem
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

type LinkedPrSuggestionItemProps = {
  suggestion: ParsedLinkedPrSuggestion;
  thread?: InferLiveObject<
    typeof schema.thread,
    {
      author: { include: { user: true } };
      assignedUser: { include: { user: true } };
    }
  > | null;
  onAccept?: () => void;
  onDismiss?: () => void;
  isAccepted?: boolean;
};

function LinkedPrSuggestionItem({
  thread,
  onAccept,
  onDismiss,
  isAccepted = false,
}: LinkedPrSuggestionItemProps) {
  if (!thread) return null;

  return (
    <div className="relative pl-7.5 group/nested-item flex gap-1.5">
      <div className="absolute left-[13px] -top-[64px] w-[13px] h-19 border-[#5C5C5C] border-b border-l rounded-bl-lg" />
      <ThreadChip
        thread={thread}
        render={<Link to="/app/threads/$id" params={{ id: thread.id }} />}
      />
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

type ThreadWithAuthor = InferLiveObject<
  typeof schema.thread,
  {
    author: { include: { user: true } };
    assignedUser: { include: { user: true } };
  }
>;

type PendingReplySignalCardProps = {
  suggestions: ParsedPendingReplySuggestion[];
  threadsMap: Map<string, ThreadWithAuthor>;
  onDismiss: (suggestion: ParsedPendingReplySuggestion) => void;
  onDismissAll: () => void;
};

function PendingReplySignalCard({
  suggestions,
  threadsMap,
  onDismiss,
  onDismissAll,
}: PendingReplySignalCardProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card className="p-4 group gap-4">
      <TooltipProvider>
        <CardHeader variant="transparent" className="border-0 px-0">
          <div className="space-y-1">
            <CardTitle>
              <Clock className="size-4 text-foreground-secondary dark:text-foreground-secondary" />{" "}
              Waiting for reply
            </CardTitle>
            <CardDescription>
              {suggestions.length === 1
                ? "A customer is waiting on a response"
                : "Customers waiting on a response"}
            </CardDescription>
          </div>
          {suggestions.length > 0 && (
            <CardAction side="right">
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
          <div className="flex flex-col gap-2 overflow-hidden">
            {suggestions.map((suggestion) => {
              const thread = threadsMap.get(suggestion.entityId);
              if (!thread) return null;
              return (
                <div
                  key={suggestion.id}
                  className="group/nested-item flex items-center gap-2"
                >
                  <ThreadChip
                    thread={thread}
                    render={
                      <Link to="/app/threads/$id" params={{ id: thread.id }} />
                    }
                  />
                  <span className="text-xs text-foreground-secondary tabular-nums ml-auto">
                    {formatRelativeTime(new Date(suggestion.lastMessageAt))}
                  </span>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover/nested-item:opacity-100 focus-within:opacity-100 group-hover/nested-item:duration-0">
                    <ActionButton
                      variant="ghost"
                      size="icon-sm"
                      tooltip="Dismiss"
                      onClick={() => onDismiss(suggestion)}
                    >
                      <X />
                    </ActionButton>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </TooltipProvider>
    </Card>
  );
}

type LoopToCloseSignalCardProps = {
  suggestions: ParsedLoopToCloseSuggestion[];
  threadsMap: Map<string, ThreadWithAuthor>;
  linkedPrByPrId: Map<string, ParsedLinkedPrSuggestion>;
  linkedPrByThreadId: Map<string, ParsedLinkedPrSuggestion>;
  onDismiss: (suggestion: ParsedLoopToCloseSuggestion) => void;
  onDismissAll: () => void;
};

function LoopToCloseSignalCard({
  suggestions,
  threadsMap,
  linkedPrByPrId,
  linkedPrByThreadId,
  onDismiss,
  onDismissAll,
}: LoopToCloseSignalCardProps) {
  return (
    <Card className="p-4 group gap-4">
      <TooltipProvider>
        <CardHeader variant="transparent" className="border-0 px-0">
          <div className="space-y-1">
            <CardTitle>
              <CheckCheck className="size-4 text-foreground-secondary dark:text-foreground-secondary" />{" "}
              Loop to close
            </CardTitle>
            <CardDescription>
              {suggestions.length === 1
                ? "A fix shipped — let the customer know"
                : "Fixes shipped — let the customer know"}
            </CardDescription>
          </div>
          {suggestions.length > 0 && (
            <CardAction side="right">
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
          <div className="flex flex-col gap-2 overflow-hidden">
            {suggestions.map((suggestion) => {
              const thread = threadsMap.get(suggestion.entityId);
              if (!thread) return null;
              const linkedPr =
                linkedPrByPrId.get(suggestion.linkedPrId) ??
                linkedPrByThreadId.get(suggestion.entityId);
              return (
                <div
                  key={suggestion.id}
                  className="group/nested-item flex items-center gap-1.5 min-w-0"
                >
                  <ThreadChip
                    thread={thread}
                    render={
                      <Link to="/app/threads/$id" params={{ id: thread.id }} />
                    }
                  />
                  <span className="inline-flex size-6 shrink-0 items-center justify-center text-foreground-secondary -ml-0.75">
                    {/** biome-ignore lint/a11y/noSvgWithoutTitle: aria-hidden is used */}
                    <svg
                      viewBox="0 0 32 10"
                      className="h-2.5 w-6 scale-x-[-1]"
                      aria-hidden
                    >
                      <path
                        d="M0 5h28m0 0l-5-4.5m5 4.5l-5 4.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  {linkedPr ? (
                    <a
                      href={linkedPr.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="border flex items-center min-w-0 h-6 rounded-sm gap-1.5 px-2 has-[>svg:first-child]:pl-1.5 text-xs bg-foreground-tertiary/15 hover:bg-foreground-tertiary/25 transition-colors"
                    >
                      <GitPullRequest className="size-3.5 shrink-0" />
                      <span className="font-medium shrink-0">
                        {linkedPr.repo}#{linkedPr.prNumber}
                      </span>
                      <span className="truncate text-foreground-secondary">
                        {linkedPr.prTitle}
                      </span>
                    </a>
                  ) : (
                    <span className="border flex items-center h-6 rounded-sm gap-1.5 px-2 text-xs bg-foreground-tertiary/15">
                      <GitPullRequest className="size-3.5 shrink-0" />
                      <span className="font-medium truncate">
                        {suggestion.linkedPrId}
                      </span>
                    </span>
                  )}
                  <span className="text-xs text-foreground-secondary whitespace-nowrap">
                    {formatRelativeTime(new Date(suggestion.prMergedAt))}
                  </span>
                  <div className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover/nested-item:opacity-100 focus-within:opacity-100 group-hover/nested-item:duration-0">
                    <ActionButton
                      variant="ghost"
                      size="icon-sm"
                      tooltip="Dismiss"
                      onClick={() => onDismiss(suggestion)}
                    >
                      <X />
                    </ActionButton>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </TooltipProvider>
    </Card>
  );
}
