/**
 * Shared helpers for consuming the org-scoped `externalEntity` mirror in the
 * web client. Issue/PR data is synced reactively via Live-State, so the UI reads
 * it through `useLiveQuery(query.externalEntity.where(...))` instead of the
 * retired on-demand GitHub fetch procedures.
 */

/**
 * The subset of an `externalEntity` mirror row the link UI displays and searches
 * over. Mirrors the columns written by the GitHub integration's upsert.
 */
export type MirrorEntity = {
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
  query: string,
): boolean => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

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
