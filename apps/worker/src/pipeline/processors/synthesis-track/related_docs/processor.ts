import { generateDocumentationQueryEmbedding } from "../../../../lib/documentation-embedding";
import { documentationIndex } from "../../../../lib/qdrant/documentation";
import type { DocumentationHit } from "../../../../lib/qdrant/documentation";
import type { ParsedSummary } from "../../../../types";
import { defineRetrievalHint } from "../define-retrieval-hint";
import type { RetrievalHintSpec } from "../define-retrieval-hint";

const buildSearchQuery = (summary: ParsedSummary): string =>
  [summary.title, summary.shortDescription, ...(summary.keywords ?? [])]
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .join("\n")
    .trim();

/**
 * Documentation evidence for a thread. The odd one out among the hints: it
 * searches by *text* rather than by the thread embedding, because the
 * documentation index is hybrid and its sparse leg matches terms. The thread
 * embedding is therefore not required.
 *
 * Never retires — docs stay relevant however the thread is resolved.
 */
export const relatedDocsHintSpec: RetrievalHintSpec<
  "related_docs",
  DocumentationHit
> = {
  count: (evidence) => evidence.docs.length,

  kind: "related_docs",

  requiresEmbedding: false,

  async retrieve({ organizationId, summary, tuning }) {
    const query = summary ? buildSearchQuery(summary) : "";
    // An absent query legitimately means "no evidence" and clears the hint. A
    // query that fails to embed does not — throw, so the prior hint survives.
    if (query.length === 0) {
      return [];
    }
    const vector = await generateDocumentationQueryEmbedding(query);
    if (!vector) {
      throw new Error("Failed to embed documentation search query");
    }
    return documentationIndex.hybrid(
      { text: query, vector },
      { limit: tuning.limit, organizationId }
    );
  },

  /**
   * Chunks are indexed per page, so several hits can share a page. Keep each
   * page's best-scoring chunk before ranking, or one long page crowds out
   * everything else.
   */
  select(hits, tuning) {
    const byPage = new Map<string, DocumentationHit>();
    for (const hit of hits) {
      const existing = byPage.get(hit.payload.pageUrl);
      if (!existing || hit.score > existing.score) {
        byPage.set(hit.payload.pageUrl, hit);
      }
    }

    const docs = [...byPage.values()]
      .toSorted((a, b) => b.score - a.score)
      .slice(0, tuning.limit)
      .map((hit) => ({
        docId: hit.payload.pageUrl,
        score: hit.score,
        title: hit.payload.pageTitle,
        url: hit.payload.pageUrl,
      }));

    return docs.length > 0 ? { docs } : null;
  },

  // The hybrid search has no score floor; the threshold is carried only so
  // evals and logs read the same shape as the other hints.
  tuning: { limit: 5, scoreThreshold: 0 },
};

export const relatedDocsProcessor = defineRetrievalHint(relatedDocsHintSpec);
