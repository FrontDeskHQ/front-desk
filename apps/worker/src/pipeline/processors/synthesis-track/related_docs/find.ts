import type { RelatedDocEvidenceItem } from "@workspace/schemas/signals";

import type { DocumentationHit } from "../../../../lib/qdrant/documentation";

export const RELATED_DOCS_LIMIT = 5;

export function pickRelatedDocs(
  hits: DocumentationHit[],
  opts: { limit?: number } = {}
): RelatedDocEvidenceItem[] {
  const limit = opts.limit ?? RELATED_DOCS_LIMIT;
  const byPage = new Map<string, DocumentationHit>();

  for (const hit of hits) {
    const existing = byPage.get(hit.payload.pageUrl);
    if (!existing || hit.score > existing.score) {
      byPage.set(hit.payload.pageUrl, hit);
    }
  }

  return [...byPage.values()]
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((hit) => ({
      docId: hit.payload.pageUrl,
      score: hit.score,
      title: hit.payload.pageTitle,
      url: hit.payload.pageUrl,
    }));
}

export function toRelatedDocsEvidence(
  hits: DocumentationHit[],
  opts?: { limit?: number }
): { docs: RelatedDocEvidenceItem[] } | null {
  const docs = pickRelatedDocs(hits, opts);
  if (docs.length === 0) {
    return null;
  }
  return { docs };
}
