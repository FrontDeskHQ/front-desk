/**
 * Shared helpers for consuming the org-scoped `externalEntity` mirror in the
 * web client. Issue/PR data is synced reactively via Live-State, so the UI reads
 * it through `useLiveQuery(query.externalEntity.where(...))` instead of the
 * retired on-demand GitHub fetch procedures.
 */

import { useLiveQuery } from "@live-state/sync/client";
import { useAtomValue } from "jotai/react";

import { activeOrganizationAtom } from "~/lib/atoms";
import { query } from "~/lib/live-state";

/**
 * The subset of an `externalEntity` mirror row the link UI displays and searches
 * over. Mirrors the columns written by the GitHub integration's upsert.
 */
export interface MirrorEntity {
  id: string;
  externalKey: string;
  type: string;
  number: number;
  repoFullName: string;
  url: string;
  title: string;
  body: string | null;
  state: string;
  authorLogin: string | null;
  assignees: string[];
  labels: string[];
  merged: boolean | null;
  draft: boolean | null;
  headRef: string | null;
  baseRef: string | null;
}

export type PullRequestState = "draft" | "open" | "closed" | "merged";

/** Derives the display state for a mirrored pull request. */
export const getPullRequestState = (
  entity: Pick<MirrorEntity, "state" | "merged" | "draft">
): PullRequestState => {
  if (entity.draft) {
    return "draft";
  }
  if (entity.merged) {
    return "merged";
  }
  if (entity.state === "closed") {
    return "closed";
  }
  return "open";
};

/**
 * Structured substring match across an entity's searchable facets: number,
 * title, body, state, repo, author, labels and assignees. An empty query
 * matches everything. Used as the Combobox `filter` so search stays reactive
 * over the local mirror rather than refetching.
 */
export const entityMatchesQuery = (
  entity: Pick<
    MirrorEntity,
    | "number"
    | "title"
    | "body"
    | "state"
    | "repoFullName"
    | "authorLogin"
    | "labels"
    | "assignees"
  >,
  searchQuery: string
): boolean => {
  const normalized = searchQuery.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const haystack = [
    `#${entity.number}`,
    entity.title,
    entity.body ?? "",
    entity.state,
    entity.repoFullName,
    entity.authorLogin ?? "",
    ...entity.labels,
    ...entity.assignees,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
};

/** Repo + number lookup for surfaces that only have a GitHub URL, not an `externalKey`. */
export interface MirrorEntityRef {
  type: "issue" | "pull_request";
  repoFullName: string;
  number: number;
}

type MirrorEntityRow = Pick<
  MirrorEntity,
  | "id"
  | "externalKey"
  | "type"
  | "number"
  | "repoFullName"
  | "url"
  | "title"
  | "body"
  | "state"
  | "authorLogin"
  | "assignees"
  | "labels"
  | "merged"
  | "draft"
  | "headRef"
  | "baseRef"
>;

const toMirrorEntity = (row: MirrorEntityRow): MirrorEntity => ({
  assignees: row.assignees,
  authorLogin: row.authorLogin,
  baseRef: row.baseRef,
  body: row.body,
  draft: row.draft,
  externalKey: row.externalKey,
  headRef: row.headRef,
  id: row.id,
  labels: row.labels,
  merged: row.merged,
  number: row.number,
  repoFullName: row.repoFullName,
  state: row.state,
  title: row.title,
  type: row.type,
  url: row.url,
});

/**
 * Reactive lookup by `externalKey` — for surfaces that store the mirror reference
 * (thread links, activity-feed metadata). Includes soft-deleted rows so
 * historical events can still resolve a label when the entity remains mirrored.
 */
export const useMirrorEntityByKey = (
  externalKey: string | null
): MirrorEntity | undefined => {
  const currentOrg = useAtomValue(activeOrganizationAtom);

  const row = useLiveQuery(
    query.externalEntity.first({
      externalKey: externalKey ?? undefined,
      organizationId: currentOrg?.id,
    })
  );

  if (!externalKey || !currentOrg?.id || !row) {
    return undefined;
  }
  return toMirrorEntity(row);
};

/**
 * Reactive lookup by repo + number — for URL-derived surfaces (markdown chips)
 * that only know `owner/repo` and the human-visible issue/PR number.
 */
export const useMirrorEntityByRef = (
  ref: MirrorEntityRef | null
): MirrorEntity | undefined => {
  const currentOrg = useAtomValue(activeOrganizationAtom);

  const row = useLiveQuery(
    query.externalEntity.first({
      deletedAt: null,
      number: ref?.number,
      organizationId: currentOrg?.id,
      repoFullName: ref?.repoFullName,
      type: ref?.type,
    })
  );

  if (!ref || !currentOrg?.id || !row) {
    return undefined;
  }
  return toMirrorEntity(row);
};

/** Display label for a mirrored issue or PR (`owner/repo#number`). */
export const formatMirrorEntityLabel = (
  entity: Pick<MirrorEntity, "repoFullName" | "number">
): string => `${entity.repoFullName}#${entity.number}`;

/** Prefer a live mirror label; fall back to the baked snapshot when absent. */
export const resolveMirrorEntityLabel = (
  entity: MirrorEntity | undefined,
  fallback: string | null | undefined
): string | null => {
  if (entity) {
    return formatMirrorEntityLabel(entity);
  }
  return fallback ?? null;
};
