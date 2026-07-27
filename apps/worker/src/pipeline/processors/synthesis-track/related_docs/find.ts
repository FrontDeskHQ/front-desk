import type { RelatedDocEvidenceItem } from "@workspace/schemas/signals";

import type { DocumentationSearchHit } from "../../../../lib/qdrant/search-documentation";

export const RELATED_DOCS_LIMIT = 5;

export function pickRelatedDocs(
  hits: DocumentationSearchHit[],
  opts: { limit?: number } = {}
): RelatedDocEvidenceItem[] {
  const limit = opts.limit ?? RELATED_DOCS_LIMIT;
  const byPage = new Map<string, DocumentationSearchHit>();

  for (const hit of hits) {
    const existing = byPage.get(hit.pageUrl);
    if (!existing || hit.score > existing.score) {
      byPage.set(hit.pageUrl, hit);
    }
  }

  return [...byPage.values()]
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((hit) => ({
      docId: hit.pageUrl,
      score: hit.score,
      title: hit.pageTitle,
      url: hit.pageUrl,
    }));
}

export function toRelatedDocsEvidence(
  hits: DocumentationSearchHit[],
  opts?: { limit?: number }
): { docs: RelatedDocEvidenceItem[] } | null {
  const docs = pickRelatedDocs(hits, opts);
  if (docs.length === 0) {
    return null;
  }
  return { docs };
}
