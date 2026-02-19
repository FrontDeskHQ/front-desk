import { google } from "@ai-sdk/google";
import { embed } from "ai";
import { createHash } from "node:crypto";
import type { Job } from "bullmq";
import { fetchClient } from "../lib/database/client";
import {
  type DocumentationChunkPayload,
  deleteDocumentationVectorsBySource,
  upsertDocumentationChunksBatch,
} from "../lib/qdrant/documentation";

const EMBEDDING_MODEL = "gemini-embedding-001";
const embeddingModel = google.embedding(EMBEDDING_MODEL);
const BATCH_CONCURRENCY = 5;
const CHUNK_MAX_CHARS = 1500;
const CHUNK_OVERLAP = 200;

interface CrawlDocumentationJobData {
  documentationSourceId: string;
  organizationId: string;
  baseUrl: string;
}

/**
 * Update the documentation source status via the API
 */
const updateSourceStatus = async (
  id: string,
  updates: Record<string, unknown>,
) => {
  try {
    await fetchClient.mutate.documentationSource.update(id, updates);
  } catch (error) {
    console.error(`Failed to update documentation source ${id}:`, error);
  }
};

/**
 * Fetch sitemap URLs from a base URL
 */
const fetchSitemapUrls = async (baseUrl: string): Promise<string[]> => {
  const sitemapUrl = `${baseUrl.replace(/\/$/, "")}/sitemap.xml`;
  const urls: string[] = [];

  try {
    const response = await fetch(sitemapUrl);
    if (!response.ok) {
      console.warn(`Failed to fetch sitemap from ${sitemapUrl}: ${response.status}`);
      return urls;
    }

    const xml = await response.text();

    // Check if this is a sitemap index (contains <sitemapindex>)
    const isSitemapIndex = xml.includes("<sitemapindex");

    if (isSitemapIndex) {
      // Extract child sitemap URLs
      const sitemapLocs = [...xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)].map(
        (m) => m[1],
      );

      // Fetch each child sitemap (one level deep)
      for (const childSitemapUrl of sitemapLocs) {
        try {
          const childResponse = await fetch(childSitemapUrl);
          if (!childResponse.ok) continue;

          const childXml = await childResponse.text();
          const childUrls = [
            ...childXml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g),
          ].map((m) => m[1]);
          urls.push(...childUrls);
        } catch {
          console.warn(`Failed to fetch child sitemap: ${childSitemapUrl}`);
        }
      }
    } else {
      // Regular sitemap — extract <loc> URLs
      const locs = [...xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)].map(
        (m) => m[1],
      );
      urls.push(...locs);
    }
  } catch (error) {
    console.error(`Error fetching sitemap from ${sitemapUrl}:`, error);
  }

  return urls;
};

/**
 * Fetch markdown content for a page URL
 */
const fetchMarkdown = async (pageUrl: string): Promise<string | null> => {
  const mdUrl = `${pageUrl.replace(/\/$/, "")}.md`;

  try {
    const response = await fetch(mdUrl);
    if (!response.ok) return null;

    const text = await response.text();
    return text.trim() || null;
  } catch {
    return null;
  }
};

interface MarkdownChunk {
  text: string;
  headingHierarchy: string[];
  title: string;
}

/**
 * Chunk markdown by headings with overlap
 */
const chunkMarkdown = (markdown: string, pageUrl: string): MarkdownChunk[] => {
  const chunks: MarkdownChunk[] = [];
  const lines = markdown.split("\n");

  let currentChunk = "";
  let currentHeadings: string[] = [];
  let pageTitle = "";

  const flushChunk = () => {
    const trimmed = currentChunk.trim();
    if (trimmed.length > 0) {
      // Split into smaller chunks if too large
      if (trimmed.length <= CHUNK_MAX_CHARS) {
        chunks.push({
          text: trimmed,
          headingHierarchy: [...currentHeadings],
          title: pageTitle || pageUrl,
        });
      } else {
        // Break large chunks at sentence boundaries
        let remaining = trimmed;
        while (remaining.length > 0) {
          let end = CHUNK_MAX_CHARS;
          if (remaining.length > CHUNK_MAX_CHARS) {
            // Try to break at a sentence boundary
            const lastPeriod = remaining.lastIndexOf(". ", end);
            const lastNewline = remaining.lastIndexOf("\n", end);
            end = Math.max(lastPeriod + 1, lastNewline + 1, CHUNK_OVERLAP);
            if (end > CHUNK_MAX_CHARS) end = CHUNK_MAX_CHARS;
          }

          chunks.push({
            text: remaining.slice(0, end).trim(),
            headingHierarchy: [...currentHeadings],
            title: pageTitle || pageUrl,
          });

          // Apply overlap
          const overlapStart = Math.max(0, end - CHUNK_OVERLAP);
          remaining = remaining.slice(overlapStart).trim();
          if (remaining.length <= CHUNK_OVERLAP) break;
        }
      }
    }
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);

    if (headingMatch) {
      // Flush the current chunk before starting a new section
      flushChunk();
      currentChunk = "";

      const level = headingMatch[1].length;
      const heading = headingMatch[2].trim();

      // Set page title from first h1
      if (level === 1 && !pageTitle) {
        pageTitle = heading;
      }

      // Trim heading hierarchy to current level
      currentHeadings = currentHeadings.slice(0, level - 1);
      currentHeadings[level - 1] = heading;
      // Remove any deeper headings
      currentHeadings = currentHeadings.slice(0, level);
    }

    currentChunk += `${line}\n`;
  }

  // Flush remaining content
  flushChunk();

  return chunks;
};

/**
 * Generate embedding for text
 */
const generateEmbedding = async (text: string): Promise<number[] | null> => {
  if (!text || text.trim().length === 0) return null;

  try {
    const { embedding } = await embed({
      model: embeddingModel,
      value: text,
      providerOptions: {
        google: {
          taskType: "RETRIEVAL_DOCUMENT",
        },
      },
    });

    // L2 normalization
    const norm = Math.hypot(...embedding);
    if (!Number.isFinite(norm) || norm === 0) return embedding;

    return embedding.map((value) => value / norm);
  } catch (error) {
    console.error("Error generating documentation embedding:", error);
    return null;
  }
};

/**
 * Generate a deterministic UUID from a string using SHA256
 */
const deterministicUuid = (input: string): string => {
  const hash = createHash("sha256").update(input).digest("hex");
  // Format as UUID v4-like
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
};

/**
 * Main handler for crawl-documentation jobs
 */
export const handleCrawlDocumentation = async (
  job: Job<CrawlDocumentationJobData>,
) => {
  const { documentationSourceId, organizationId, baseUrl } = job.data;

  console.log(
    `\nCrawl-documentation job ${job.id}: Starting crawl for ${baseUrl}`,
  );

  await updateSourceStatus(documentationSourceId, {
    status: "crawling",
    errorStr: null,
    updatedAt: new Date(),
  });

  try {
    // 1. Fetch sitemap URLs
    const pageUrls = await fetchSitemapUrls(baseUrl);

    if (pageUrls.length === 0) {
      await updateSourceStatus(documentationSourceId, {
        status: "failed",
        errorStr: "No pages found in sitemap",
        updatedAt: new Date(),
      });
      return { success: false, error: "No pages found in sitemap" };
    }

    console.log(`Found ${pageUrls.length} URLs in sitemap for ${baseUrl}`);

    // 2. Delete existing vectors for this source (for re-crawl)
    await deleteDocumentationVectorsBySource(documentationSourceId);

    // 3. Process pages and collect chunks
    let totalChunks = 0;
    let processedPages = 0;

    for (let pageIdx = 0; pageIdx < pageUrls.length; pageIdx += BATCH_CONCURRENCY) {
      const pageBatch = pageUrls.slice(pageIdx, pageIdx + BATCH_CONCURRENCY);

      const batchResults = await Promise.all(
        pageBatch.map(async (pageUrl) => {
          const markdown = await fetchMarkdown(pageUrl);
          if (!markdown) return null;

          const chunks = chunkMarkdown(markdown, pageUrl);
          if (chunks.length === 0) return null;

          return { pageUrl, chunks };
        }),
      );

      for (const result of batchResults) {
        if (!result) continue;

        processedPages++;
        const { pageUrl, chunks } = result;

        // Generate embeddings and upsert in batches
        for (let i = 0; i < chunks.length; i += BATCH_CONCURRENCY) {
          const chunkBatch = chunks.slice(i, i + BATCH_CONCURRENCY);

          const points: Array<{
            id: string;
            vector: {
              dense: number[];
              bm25: { text: string; model: "qdrant/bm25" };
            };
            payload: DocumentationChunkPayload;
          }> = [];

          const embedResults = await Promise.all(
            chunkBatch.map(async (chunk, batchIdx) => {
              const chunkIndex = i + batchIdx;
              const embedding = await generateEmbedding(chunk.text);
              if (!embedding) return null;

              const pointId = deterministicUuid(
                `${documentationSourceId}:${pageUrl}:${chunkIndex}`,
              );

              return {
                id: pointId,
                vector: {
                  dense: embedding,
                  bm25: {
                    text: chunk.text,
                    model: "qdrant/bm25" as const,
                  },
                },
                payload: {
                  organizationId,
                  documentationSourceId,
                  pageUrl,
                  pageTitle: chunk.title,
                  chunkIndex,
                  chunkText: chunk.text,
                  headingHierarchy: chunk.headingHierarchy,
                },
              };
            }),
          );

          for (const result of embedResults) {
            if (result) points.push(result);
          }

          if (points.length > 0) {
            await upsertDocumentationChunksBatch(points);
            totalChunks += points.length;
          }
        }
      }

      // Update progress
      await updateSourceStatus(documentationSourceId, {
        pageCount: processedPages,
        chunksIndexed: totalChunks,
        updatedAt: new Date(),
      });

      job.updateProgress(
        Math.round(((pageIdx + pageBatch.length) / pageUrls.length) * 100),
      );
    }

    // 4. Mark as completed
    await updateSourceStatus(documentationSourceId, {
      status: "completed",
      lastCrawledAt: new Date(),
      pageCount: processedPages,
      chunksIndexed: totalChunks,
      updatedAt: new Date(),
    });

    console.log(
      `Crawl complete for ${baseUrl}: ${processedPages} pages, ${totalChunks} chunks`,
    );

    return {
      success: true,
      pagesProcessed: processedPages,
      chunksIndexed: totalChunks,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    await updateSourceStatus(documentationSourceId, {
      status: "failed",
      errorStr: errorMessage,
      updatedAt: new Date(),
    });

    console.error(`Crawl failed for ${baseUrl}:`, error);
    throw error;
  }
};
