import { createHash } from "node:crypto";

import { google } from "@ai-sdk/google";
import { createAILogger } from "@workspace/utils/logging";
import { embed } from "ai";
import type { Job } from "bullmq";

import { AI_PRICING } from "../lib/ai-pricing";
import { fetchClient } from "../lib/database/client";
import { createWorkerJobLogger } from "../lib/logging";
import type { WorkerLogger } from "../lib/logging";
import {
  deleteDocumentationVectorsBySource,
  upsertDocumentationChunksBatch,
} from "../lib/qdrant/documentation";
import type { DocumentationChunkPayload } from "../lib/qdrant/documentation";

const EMBEDDING_MODEL = "gemini-embedding-001";
const embeddingModel = google.embedding(EMBEDDING_MODEL);
const BATCH_CONCURRENCY = 5;
const CHUNK_MAX_CHARS = 1500;
const CHUNK_OVERLAP = 200;
const FETCH_TIMEOUT_MS = 30_000;

interface CrawlDocumentationJobData {
  documentationSourceId: string;
  organizationId: string;
  baseUrl: string;
}

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
};

type CrawlLogger = WorkerLogger;

/**
 * Update the documentation source status via the API
 */
const updateSourceStatus = async (
  id: string,
  organizationId: string,
  updates: {
    status?: "pending" | "crawling" | "completed" | "failed";
    errorStr?: string | null;
    pageCount?: number;
    chunksIndexed?: number;
    lastCrawledAt?: Date;
    updatedAt?: Date;
  },
  requestLog: CrawlLogger
) => {
  try {
    await fetchClient.mutate.documentationSource.syncCrawlProgress({
      id,
      organizationId,
      ...updates,
    });
  } catch (error) {
    requestLog.error(error instanceof Error ? error : String(error), {
      documentationSourceId: id,
      organizationId,
      step: "update_source_status",
      sourceStatus: updates.status,
    });
  }
};

/**
 * Fetch sitemap URLs from a base URL
 */
const fetchSitemapUrls = async (
  baseUrl: string,
  requestLog: CrawlLogger
): Promise<string[]> => {
  const sitemapUrl = `${baseUrl.replace(/\/$/, "")}/sitemap.xml`;
  const urls: string[] = [];

  try {
    const response = await fetch(sitemapUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      requestLog.warn("Sitemap request returned a non-success status", {
        crawl: { sitemapUrl, statusCode: response.status },
      });
      return urls;
    }

    const xml = await response.text();

    // Check if this is a sitemap index (contains <sitemapindex>)
    const isSitemapIndex = xml.includes("<sitemapindex");

    if (isSitemapIndex) {
      // Extract child sitemap URLs
      const sitemapLocs = [...xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)].flatMap(
        (m) => m[1] ?? []
      );

      // Fetch each child sitemap (one level deep)
      for (const childSitemapUrl of sitemapLocs) {
        try {
          const childResponse = await fetch(childSitemapUrl, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          if (!childResponse.ok) {
            requestLog.warn(
              "Child sitemap request returned a non-success status",
              {
                crawl: {
                  sitemapUrl: childSitemapUrl,
                  statusCode: childResponse.status,
                },
              }
            );
            continue;
          }

          const childXml = await childResponse.text();
          const childUrls = [
            ...childXml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g),
          ].flatMap((m) => m[1] ?? []);
          urls.push(...childUrls);
        } catch (error) {
          requestLog.warn("Child sitemap request failed", {
            crawl: { sitemapUrl: childSitemapUrl },
            error: { message: formatError(error) },
          });
        }
      }
    } else {
      // Regular sitemap — extract <loc> URLs
      const locs = [...xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)].flatMap(
        (m) => m[1] ?? []
      );
      urls.push(...locs);
    }
  } catch (error) {
    requestLog.error(error instanceof Error ? error : String(error), {
      crawl: { sitemapUrl },
      step: "fetch_sitemap",
    });
    throw error;
  }

  return urls;
};

/**
 * Fetch markdown content for a page URL
 */
const fetchMarkdown = async (
  pageUrl: string,
  requestLog: CrawlLogger
): Promise<string | null> => {
  const mdUrl = `${pageUrl.replace(/\/$/, "")}.md`;

  try {
    const response = await fetch(mdUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      requestLog.warn(
        "Documentation page request returned a non-success status",
        {
          crawl: { pageUrl, statusCode: response.status },
        }
      );
      return null;
    }

    const text = await response.text();
    return text.trim() || null;
  } catch (error) {
    requestLog.warn("Documentation page request failed", {
      crawl: { pageUrl },
      error: {
        message: formatError(error),
      },
    });
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
          headingHierarchy: [...currentHeadings],
          text: trimmed,
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
            const hasBreakPoint = lastPeriod !== -1 || lastNewline !== -1;
            if (hasBreakPoint) {
              end = Math.max(
                lastPeriod + 1,
                lastNewline + 1,
                CHUNK_OVERLAP + 1
              );
              if (end > CHUNK_MAX_CHARS) {
                end = CHUNK_MAX_CHARS;
              }
            } else {
              // No sentence boundary found — hard cut at CHUNK_MAX_CHARS to guarantee forward progress
              end = CHUNK_MAX_CHARS;
            }
          }

          chunks.push({
            headingHierarchy: [...currentHeadings],
            text: remaining.slice(0, end).trim(),
            title: pageTitle || pageUrl,
          });

          // Apply overlap
          const overlapStart = Math.max(0, end - CHUNK_OVERLAP);
          remaining = remaining.slice(overlapStart).trim();
          if (remaining.length <= CHUNK_OVERLAP) {
            break;
          }
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

      const level = (headingMatch[1] ?? "").length;
      const heading = (headingMatch[2] ?? "").trim();

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
  job: Job<CrawlDocumentationJobData>
) => {
  const { documentationSourceId, organizationId, baseUrl } = job.data;
  const requestLog = createWorkerJobLogger(
    "crawl-documentation",
    job,
    "documentation.crawl",
    {
      documentation: {
        baseUrl,
        documentationSourceId,
        organizationId,
        fetchTimeoutMs: FETCH_TIMEOUT_MS,
        batchConcurrency: BATCH_CONCURRENCY,
      },
    }
  );
  const ai = createAILogger(requestLog, { cost: AI_PRICING });
  let status = 200;
  let pagesWithoutContent = 0;
  let totalChunks = 0;
  let processedPages = 0;

  requestLog.set({
    crawl: {
      phase: "started",
      status: "running",
    },
  });

  try {
    await updateSourceStatus(
      documentationSourceId,
      organizationId,
      {
        errorStr: null,
        status: "crawling",
        updatedAt: new Date(),
      },
      requestLog
    );

    // 1. Fetch sitemap URLs
    const pageUrls = await fetchSitemapUrls(baseUrl, requestLog);
    requestLog.set({ crawl: { sitemapUrlCount: pageUrls.length } });

    if (pageUrls.length === 0) {
      status = 422;
      requestLog.warn("Documentation sitemap contained no pages", {
        step: "fetch_sitemap",
      });
      await updateSourceStatus(
        documentationSourceId,
        organizationId,
        {
          errorStr: "No pages found in sitemap",
          status: "failed",
          updatedAt: new Date(),
        },
        requestLog
      );
      requestLog.set({
        outcome: {
          status: "failed",
          reason: "empty_sitemap",
          pagesProcessed: processedPages,
          chunksIndexed: totalChunks,
        },
      });
      return { error: "No pages found in sitemap", success: false };
    }

    // 2. Delete existing vectors for this source (for re-crawl)
    const deleteOk = await deleteDocumentationVectorsBySource(
      documentationSourceId
    );
    if (!deleteOk) {
      throw new Error(
        `Failed to delete documentation vectors for source ${documentationSourceId}`
      );
    }

    // 3. Process pages and collect chunks
    for (
      let pageIdx = 0;
      pageIdx < pageUrls.length;
      pageIdx += BATCH_CONCURRENCY
    ) {
      const pageBatch = pageUrls.slice(pageIdx, pageIdx + BATCH_CONCURRENCY);

      const batchResults = await Promise.all(
        pageBatch.map(async (pageUrl) => {
          const markdown = await fetchMarkdown(pageUrl, requestLog);
          if (!markdown) {
            return null;
          }

          const chunks = chunkMarkdown(markdown, pageUrl);
          if (chunks.length === 0) {
            return null;
          }

          return { chunks, pageUrl };
        })
      );
      pagesWithoutContent += batchResults.filter(
        (result) => result === null
      ).length;

      for (const result of batchResults) {
        if (!result) {
          continue;
        }

        processedPages++;
        const { pageUrl, chunks } = result;

        // Generate embeddings and upsert in batches
        for (let i = 0; i < chunks.length; i += BATCH_CONCURRENCY) {
          const chunkBatch = chunks.slice(i, i + BATCH_CONCURRENCY);

          const points: {
            id: string;
            vector: {
              dense: number[];
              bm25: { text: string; model: "qdrant/bm25" };
            };
            payload: DocumentationChunkPayload;
          }[] = [];

          const embedResults = await Promise.all(
            chunkBatch.map(async (chunk, batchIdx) => {
              const chunkIndex = i + batchIdx;
              const embedding = await generateEmbeddingWithObservability(
                chunk.text,
                ai,
                requestLog
              );
              if (!embedding) {
                return null;
              }

              const pointId = deterministicUuid(
                `${documentationSourceId}:${pageUrl}:${chunkIndex}`
              );

              return {
                id: pointId,
                payload: {
                  chunkIndex,
                  chunkText: chunk.text,
                  documentationSourceId,
                  headingHierarchy: chunk.headingHierarchy,
                  organizationId,
                  pageTitle: chunk.title,
                  pageUrl,
                },
                vector: {
                  bm25: {
                    model: "qdrant/bm25" as const,
                    text: chunk.text,
                  },
                  dense: embedding,
                },
              };
            })
          );

          for (const embedResult of embedResults) {
            if (embedResult) {
              points.push(embedResult);
            }
          }

          if (points.length > 0) {
            const upsertOk = await upsertDocumentationChunksBatch(points);
            if (!upsertOk) {
              throw new Error(
                `Failed to upsert documentation chunks batch for source ${documentationSourceId} (page: ${pageUrl}, ${points.length} chunks)`
              );
            }
            totalChunks += points.length;
          }
        }
      }

      // Update progress
      await updateSourceStatus(
        documentationSourceId,
        organizationId,
        {
          chunksIndexed: totalChunks,
          pageCount: processedPages,
          updatedAt: new Date(),
        },
        requestLog
      );

      try {
        await job.updateProgress(
          Math.round(((pageIdx + pageBatch.length) / pageUrls.length) * 100)
        );
      } catch (error) {
        requestLog.warn("Failed to update BullMQ job progress", {
          job: { id: String(job.id ?? "unknown") },
          step: "update_progress",
          error: { message: formatError(error) },
        });
      }
    }

    // 4. Mark as completed
    await updateSourceStatus(
      documentationSourceId,
      organizationId,
      {
        chunksIndexed: totalChunks,
        lastCrawledAt: new Date(),
        pageCount: processedPages,
        status: "completed",
        updatedAt: new Date(),
      },
      requestLog
    );

    requestLog.set({
      crawl: {
        pagesProcessed: processedPages,
        pagesWithoutContent,
        status: "completed",
        totalChunks,
      },
      outcome: {
        status: "completed",
        chunksIndexed: totalChunks,
        pagesProcessed: processedPages,
      },
    });

    return {
      chunksIndexed: totalChunks,
      pagesProcessed: processedPages,
      success: true,
    };
  } catch (error) {
    status = 500;
    const errorMessage = error instanceof Error ? error.message : String(error);

    await updateSourceStatus(
      documentationSourceId,
      organizationId,
      {
        errorStr: errorMessage,
        status: "failed",
        updatedAt: new Date(),
      },
      requestLog
    );

    requestLog.error(error instanceof Error ? error : String(error), {
      crawl: {
        pagesWithoutContent,
      },
      retryable: true,
      step: "crawl",
    });
    requestLog.set({
      outcome: {
        status: "failed",
        chunksIndexed: totalChunks,
        pagesProcessed: processedPages,
        pagesWithoutContent,
        reason: "exception",
      },
    });
    throw error;
  } finally {
    requestLog.emit({ status });
  }
};

const generateEmbeddingWithObservability = async (
  text: string,
  ai: ReturnType<typeof createAILogger>,
  requestLog: CrawlLogger
): Promise<number[] | null> => {
  if (!text || text.trim().length === 0) {
    return null;
  }

  try {
    const { embedding, usage } = await embed({
      model: embeddingModel,
      providerOptions: {
        google: {
          taskType: "RETRIEVAL_DOCUMENT",
        },
      },
      value: text,
    });
    ai.captureEmbed({
      count: 1,
      dimensions: embedding.length,
      model: EMBEDDING_MODEL,
      usage,
    });

    const norm = Math.hypot(...embedding);
    if (!Number.isFinite(norm) || norm === 0) {
      requestLog.warn(
        "Documentation embedding normalization produced an invalid norm",
        {
          embedding: { dimensions: embedding.length, norm },
          step: "normalize_embedding",
        }
      );
      return embedding;
    }

    return embedding.map((value) => value / norm);
  } catch (error) {
    requestLog.error(error instanceof Error ? error : String(error), {
      step: "generate_documentation_embedding",
      retryable: true,
    });
    return null;
  }
};
