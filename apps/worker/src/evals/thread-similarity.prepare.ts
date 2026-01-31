import { batchEmbedThread } from "../pipeline/processors/embed";
import { ensureThreadsCollection, upsertThreadVector } from "../lib/qdrant/threads";
import {
  buildThreadSimilarityDataset,
  convertToThread,
  TEST_ORGANIZATION_ID,
} from "./thread-similarity.dataset";

const parseSummaryValue = (lines: string[], prefix: string): string => {
  const match = lines.find((line) =>
    line.toLowerCase().startsWith(prefix.toLowerCase()),
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
    title,
    shortDescription,
    keywords,
    entities,
    expectedAction,
  };
};

const buildPayload = (
  thread: ReturnType<typeof convertToThread>,
  summary: string,
) => {
  const parsed = parseSummary(summary);
  const labelNames =
    thread.labels
      ?.map((threadLabel) => threadLabel.label?.name)
      .filter((label): label is string => Boolean(label)) ?? [];
  const firstMessage = thread.messages?.[0]?.content ?? "";
  const createdAt = thread.createdAt?.getTime?.() ?? Date.now();

  return {
    threadId: thread.id,
    organizationId: TEST_ORGANIZATION_ID,
    title: parsed.title || thread.name || "Untitled",
    shortDescription:
      parsed.shortDescription || firstMessage || "No summary available.",
    keywords: parsed.keywords,
    entities: parsed.entities,
    expectedAction: parsed.expectedAction || "triage",
    status: thread.status ?? 0,
    priority: thread.priority ?? 0,
    authorId: thread.authorId ?? "author_eval",
    assignedUserId: thread.assignedUserId ?? null,
    labels: labelNames,
    createdAt,
    updatedAt: Date.now(),
  };
};

const main = async (): Promise<void> => {
  const startTime = performance.now();

  console.log("=".repeat(72));
  console.log("Thread Similarity Dataset Preparation");
  console.log("=".repeat(72));
  console.log(`Organization ID: ${TEST_ORGANIZATION_ID}`);

  const datasetStartTime = performance.now();
  const { threads: rawThreads } = buildThreadSimilarityDataset();
  const threads = rawThreads.map(convertToThread);
  const threadMap = new Map(threads.map((thread) => [thread.id, thread]));
  const datasetTime = performance.now() - datasetStartTime;
  console.log(`Dataset loaded in ${(datasetTime / 1000).toFixed(2)}s`);

  const collectionStartTime = performance.now();
  const collectionReady = await ensureThreadsCollection();
  if (!collectionReady) {
    console.error("Failed to ensure Qdrant collection.");
    process.exit(1);
  }
  const collectionTime = performance.now() - collectionStartTime;
  console.log(`Collection ensured in ${(collectionTime / 1000).toFixed(2)}s`);

  console.log(`\nSummarizing + embedding ${threads.length} threads...`);
  const embedStartTime = performance.now();
  const results = await batchEmbedThread(threads, { concurrency: 4 });
  const embedTime = performance.now() - embedStartTime;
  console.log(`Embedding completed in ${(embedTime / 1000).toFixed(2)}s`);

  let successCount = 0;
  let errorCount = 0;

  const upsertStartTime = performance.now();
  for (const result of results) {
    if (!result.success) {
      errorCount += 1;
      console.warn(`  ⚠️  ${result.threadId}: ${result.error}`);
      continue;
    }

    const thread = threadMap.get(result.threadId);
    if (!thread) {
      errorCount += 1;
      console.warn(`  ⚠️  Missing thread for ${result.threadId}`);
      continue;
    }

    const payload = buildPayload(thread, result.summary);
    const pointId = crypto.randomUUID();
    const upserted = await upsertThreadVector(pointId, result.embedding, payload);

    if (!upserted) {
      errorCount += 1;
      console.warn(`  ⚠️  Failed to upsert ${result.threadId}`);
      continue;
    }

    successCount += 1;
  }
  const upsertTime = performance.now() - upsertStartTime;

  const totalTime = performance.now() - startTime;

  console.log("\nPreparation complete.");
  console.log(`  ✅ Upserted: ${successCount}`);
  console.log(`  ⚠️  Errors: ${errorCount}`);
  console.log(`\nTiming Summary:`);
  console.log(`  Dataset loading: ${(datasetTime / 1000).toFixed(2)}s`);
  console.log(`  Collection setup: ${(collectionTime / 1000).toFixed(2)}s`);
  console.log(`  Embedding: ${(embedTime / 1000).toFixed(2)}s`);
  console.log(`  Upserting: ${(upsertTime / 1000).toFixed(2)}s`);
  console.log(`  Total time: ${(totalTime / 1000).toFixed(2)}s`);
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
