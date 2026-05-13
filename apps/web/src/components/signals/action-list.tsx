import type { InferLiveObject } from "@live-state/sync";
import { useLiveQuery } from "@live-state/sync/client";
import type { schema } from "api/schema";
import { useMemo } from "react";
import {
  ActionRowSkeleton,
  type ActorContext,
  canRenderSuggestion,
  DuplicateActionRow,
  LinkedPrActionRow,
  LoopToCloseActionRow,
  PendingReplyActionRow,
  StatusActionRow,
  type SuggestionRow,
} from "~/components/signals/action-row";
import { CaughtUpEmpty, NewOrgEmpty } from "~/components/signals/empty-states";
import { query } from "~/lib/live-state";

type ThreadWithRels = InferLiveObject<
  typeof schema.thread,
  {
    author: { include: { user: true } };
    assignedUser: { include: { user: true } };
  }
>;

type Props = {
  organizationId: string;
  ctx: ActorContext;
  isNewOrg?: boolean;
};

const ROW_FOR_TYPE: Record<
  string,
  React.ComponentType<{
    suggestion: SuggestionRow;
    threadsMap: Map<string, ThreadWithRels>;
    ctx: ActorContext;
  }>
> = {
  status: StatusActionRow,
  duplicate: DuplicateActionRow,
  linked_pr: LinkedPrActionRow,
  "digest:pending_reply": PendingReplyActionRow,
  "digest:loop_to_close": LoopToCloseActionRow,
};

const KNOWN_TYPES = Object.keys(ROW_FOR_TYPE);

export function ActionList({ organizationId, ctx, isNewOrg }: Props) {
  const rawSuggestions = useLiveQuery(
    query.suggestion.where({
      organizationId,
      active: true,
      dismissedAt: null,
      actedAt: null,
    }),
  );

  const suggestions = useMemo<SuggestionRow[]>(() => {
    if (!rawSuggestions) return [];
    return rawSuggestions
      .filter((s) => KNOWN_TYPES.includes(s.type))
      .map((s) => ({
        id: s.id,
        type: s.type,
        entityId: s.entityId,
        relatedEntityId: s.relatedEntityId,
        resultsStr: s.resultsStr,
        metadataStr: s.metadataStr,
        summary: s.summary,
        createdAt: new Date(s.createdAt),
        urgencyScore: s.urgencyScore ?? 0,
      }))
      .filter(canRenderSuggestion)
      .sort((a, b) => {
        const scoreDiff = (b.urgencyScore ?? 0) - (a.urgencyScore ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
  }, [rawSuggestions]);

  const threadIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of suggestions) {
      ids.add(s.entityId);
      if (s.relatedEntityId) ids.add(s.relatedEntityId);
    }
    return Array.from(ids);
  }, [suggestions]);

  const threads = useLiveQuery(
    query.thread
      .where({
        id: { $in: threadIds },
        organizationId,
      })
      .include({
        author: { include: { user: true } },
        assignedUser: { include: { user: true } },
      }),
  );

  const threadsMap = useMemo(() => {
    const map = new Map<string, ThreadWithRels>();
    for (const t of threads ?? []) map.set(t.id, t);
    return map;
  }, [threads]);

  if (!rawSuggestions) {
    return (
      <div className="flex w-full max-w-4xl mx-auto flex-col gap-2">
        <ActionRowSkeleton />
        <ActionRowSkeleton />
        <ActionRowSkeleton />
      </div>
    );
  }

  if (suggestions.length === 0) {
    return isNewOrg ? <NewOrgEmpty /> : <CaughtUpEmpty />;
  }

  return (
    <div className="flex w-full max-w-4xl mx-auto flex-col gap-3">
      <div className="text-foreground-primary text-lg px-1">
        {suggestions.length === 1 ? "Here's" : "Here are"} {suggestions.length}{" "}
        {suggestions.length === 1
          ? "thing that requires"
          : "things that require"}{" "}
        your attention
      </div>
      <div className="flex flex-col gap-4">
        {suggestions.map((s) => {
          const RowComponent = ROW_FOR_TYPE[s.type];
          if (!RowComponent) return null;
          return (
            <RowComponent
              key={s.id}
              suggestion={s}
              threadsMap={threadsMap}
              ctx={ctx}
            />
          );
        })}
      </div>
    </div>
  );
}
