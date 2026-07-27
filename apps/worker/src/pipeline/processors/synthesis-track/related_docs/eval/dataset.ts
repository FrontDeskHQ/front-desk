import type { DocumentationSearchHit } from "../../../../../lib/qdrant/search-documentation";

export interface RelatedDocsTestCase {
  name: string;
  input: { hits: DocumentationSearchHit[]; limit?: number };
  expected: { docIds: string[] };
}

const hit = (
  pageUrl: string,
  pageTitle: string,
  score: number
): DocumentationSearchHit => ({
  chunkText: `Chunk for ${pageTitle}`,
  headingHierarchy: [],
  pageTitle,
  pageUrl,
  score,
});

export const relatedDocsDataset: RelatedDocsTestCase[] = [
  {
    expected: { docIds: ["https://docs.example/a", "https://docs.example/b"] },
    input: {
      hits: [
        hit("https://docs.example/a", "Page A", 0.7),
        hit("https://docs.example/a", "Page A", 0.9),
        hit("https://docs.example/b", "Page B", 0.8),
      ],
    },
    name: "dedupes chunks by pageUrl keeping highest score",
  },
  {
    expected: {
      docIds: [
        "https://docs.example/high",
        "https://docs.example/mid",
        "https://docs.example/low",
      ],
    },
    input: {
      hits: [
        hit("https://docs.example/low", "Low", 0.4),
        hit("https://docs.example/high", "High", 0.95),
        hit("https://docs.example/mid", "Mid", 0.7),
      ],
    },
    name: "sorts by score descending",
  },
  {
    expected: { docIds: ["https://docs.example/1", "https://docs.example/2"] },
    input: {
      hits: [
        hit("https://docs.example/1", "One", 0.9),
        hit("https://docs.example/2", "Two", 0.8),
        hit("https://docs.example/3", "Three", 0.7),
      ],
      limit: 2,
    },
    name: "respects limit",
  },
  {
    expected: { docIds: [] },
    input: { hits: [] },
    name: "empty hits -> no docs",
  },
];
