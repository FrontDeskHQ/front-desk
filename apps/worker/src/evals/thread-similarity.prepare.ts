import { createLogger } from "@workspace/utils/logging";

import { errorFields } from "../lib/logging";
import {
  ensureThreadsCollection,
  upsertThreadVector,
} from "../lib/qdrant/threads";
import { batchEmbedThread } from "../pipeline/processors/embed";
import {
  buildThreadSimilarityDataset,
  convertToThread,
  TEST_ORGANIZATION_ID,
} from "./thread-similarity.dataset";

const parseSummaryValue = (lines: string[], prefix: string): string => {
  const match = lines.find((line) =>
    line.toLowerCase().startsWith(prefix.toLowerCase())
  );
  if (!match) {
    return "";
  }
  return match.slice(prefix.length).trim();
};

const parseSummary = (summary: string) => {
  const lines = summary
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const title = parseSummaryValue(lines, "Title:");
  const shortDescription = parseSummaryValue(lines, "Short Description:");
  const keywordsRaw = parseSummaryValue(lines, "Keywords:");
  const entitiesRaw = parseSummaryValue(lines, "Entities:");
  const expectedAction = parseSummaryValue(lines, "Expected Action:");

  const keywords = keywordsRaw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const entities = entitiesRaw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    entities,
    expectedAction,
    keywords,
    shortDescription,
    title,
  };
};

const buildPayload = (
  thread: ReturnType<typeof convertToThread>,
  summary: string
) => {
  const parsed = parseSummary(summary);
  const labelNames =
    thread.labels
      ?.map((threadLabel) => threadLabel.label?.name)
      .filter((label): label is string => Boolean(label)) ?? [];
  const firstMessage = thread.messages?.[0]?.content ?? "";
  const createdAt = thread.createdAt?.getTime?.() ?? Date.now();

  return {
    assignedUserId: thread.assignedUserId ?? null,
    authorId: thread.authorId ?? "author_eval",
    createdAt,
    entities: parsed.entities,
    expectedAction: parsed.expectedAction || "triage",
    keywords: parsed.keywords,
    labels: labelNames,
    organizationId: TEST_ORGANIZATION_ID,
    priority: thread.priority ?? 0,
    shortDescription:
      parsed.shortDescription || firstMessage || "No summary available.",
    status: thread.status ?? 0,
    threadId: thread.id,
    title: parsed.title || thread.name || "Untitled",
    updatedAt: Date.now(),
  };
};

const main = async (): Promise<void> => {
  const startTime = performance.now();
  const requestLog = createLogger({
    action: "worker.eval_prepare",
    operation: "thread_similarity.prepare",
    organizationId: TEST_ORGANIZATION_ID,
  });
  let status = 200;

  try {
    const datasetStartTime = performance.now();
    const { threads: rawThreads } = buildThreadSimilarityDataset();
    const threads = rawThreads.map(convertToThread);
    const threadMap = new Map(threads.map((thread) => [thread.id, thread]));
    const datasetTime = performance.now() - datasetStartTime;
    requestLog.set({
      dataset: { threadCount: threads.length, durationMs: datasetTime },
    });

    const collectionStartTime = performance.now();
    const collectionReady = await ensureThreadsCollection();
    if (!collectionReady) {
      throw new Error("Failed to ensure Qdrant collection");
    }
    const collectionTime = performance.now() - collectionStartTime;
    requestLog.set({
      qdrant: { collectionReady: true, durationMs: collectionTime },
    });

    const embedStartTime = performance.now();
    const results = await batchEmbedThread(threads, { concurrency: 4 });
    const embedTime = performance.now() - embedStartTime;
    requestLog.set({
      embedding: {
        durationMs: embedTime,
        successCount: results.filter((result) => result.success).length,
        errorCount: results.filter((result) => !result.success).length,
      },
    });

    let successCount = 0;
    let errorCount = 0;
    const upsertStartTime = performance.now();

    for (const result of results) {
      if (!result.success) {
        errorCount += 1;
        requestLog.warn("Thread embedding failed", {
          threadId: result.threadId,
          error: { message: result.error },
          step: "embed_thread",
        });
        continue;
      }

      const thread = threadMap.get(result.threadId);
      if (!thread) {
        errorCount += 1;
        requestLog.warn("Embedded thread was not found in the dataset", {
          threadId: result.threadId,
          step: "build_thread_payload",
        });
        continue;
      }

      const payload = buildPayload(thread, result.summary);
      const pointId = crypto.randomUUID();
      const upserted = await upsertThreadVector(
        pointId,
        result.embedding,
        payload
      );

      if (!upserted) {
        errorCount += 1;
        requestLog.warn("Failed to upsert embedded thread", {
          threadId: result.threadId,
          step: "upsert_thread_vector",
        });
        continue;
      }

      successCount += 1;
    }

    const upsertTime = performance.now() - upsertStartTime;
    const totalTime = performance.now() - startTime;
    requestLog.set({
      outcome: {
        status: errorCount > 0 ? "completed_with_errors" : "completed",
        upserted: successCount,
        errors: errorCount,
      },
      timing: {
        datasetMs: datasetTime,
        collectionMs: collectionTime,
        embeddingMs: embedTime,
        upsertingMs: upsertTime,
        totalMs: totalTime,
      },
    });
    if (errorCount > 0) {
      status = 207;
    }
  } catch (error) {
    status = 500;
    requestLog.error(error instanceof Error ? error : String(error), {
      error: errorFields(error),
      step: "thread_similarity.prepare",
    });
    throw error;
  } finally {
    requestLog.emit({ status });
  }
};

main().catch(() => {
  process.exit(1);
});
