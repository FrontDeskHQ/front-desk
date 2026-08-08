import { defineIndex, uuidFromParts } from "./define-index";
import type { SearchHit } from "./define-index";

export const DOCUMENTATION_COLLECTION = "documentation-v1";

export interface DocumentationChunkPayload {
  organizationId: string;
  documentationSourceId: string;
  pageUrl: string;
  pageTitle: string;
  chunkIndex: number;
  chunkText: string;
  headingHierarchy: string[];
}

export type DocumentationHit = SearchHit<DocumentationChunkPayload>;

/**
 * Hybrid index over crawled documentation chunks. Searched with
 * `documentationIndex.hybrid({ vector, text })` — the sparse leg matches terms,
 * so the raw query string travels alongside the embedding — and read a page at
 * a time with `scroll({ where: { pageUrl } })`.
 *
 * A chunk is identified by its source, page and position, so a re-crawl
 * overwrites chunks in place instead of layering a second copy of the page.
 */
export const documentationIndex = defineIndex<
  DocumentationChunkPayload,
  "documentationSourceId" | "pageUrl" | "chunkIndex",
  true
>({
  dimensions: 3072,
  key: ({ documentationSourceId, pageUrl, chunkIndex }) =>
    uuidFromParts(documentationSourceId, pageUrl, chunkIndex),
  name: DOCUMENTATION_COLLECTION,
  payloadIndexes: [
    { field: "organizationId", schema: "keyword" },
    { field: "documentationSourceId", schema: "keyword" },
    { field: "pageUrl", schema: "keyword" },
  ],
  sparse: true,
});
