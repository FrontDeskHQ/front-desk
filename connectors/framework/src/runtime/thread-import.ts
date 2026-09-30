import type { ThreadImportStatus } from "@workspace/schemas/integration/shared";

import type { SupportEntryPointImportThreadPayload } from "../capabilities";
import { threadImportQueueName } from "../thread-import";
import type { ThreadImportJobData } from "../thread-import";
import type { LiveStateFetchClient } from "./live-state";
import { createWorker } from "./redis";
import type { Worker } from "./redis";

/** A thread a connector found in a selected support channel. */
export interface ThreadImportCandidate {
  externalThreadId: string;
  /** Epoch ms of the thread's root message; newest threads import first. */
  startedAt: number;
}

export type ThreadImportPayload = Omit<
  SupportEntryPointImportThreadPayload,
  "integrationId" | "provider"
>;

/**
 * The provider-specific half of an import. Everything else (allowance,
 * dedup against known threads, ordering, progress) is shared.
 */
export interface ThreadImportSource {
  /**
   * One page stream per selected channel, each yielding candidates newest
   * first. A channel that throws counts as a failure; the others continue.
   */
  channels: AsyncIterable<ThreadImportCandidate[]>[];
  /**
   * Fetch a candidate this source listed as its full thread, applying the
   * connector's live ingestion content rules. Only listed candidates work:
   * sources keep provider handles from listing. `null` when nothing eligible is left (e.g. a bot-only
   * thread), which neither imports nor fails.
   */
  load: (
    candidate: ThreadImportCandidate
  ) => Promise<ThreadImportPayload | null>;
}

interface ThreadImportContext {
  fetchClient: LiveStateFetchClient;
  integrationId: string;
  provider: string;
}

const report = (context: ThreadImportContext, status: ThreadImportStatus) =>
  context.fetchClient.mutate.ingest.reportThreadImport({
    integrationId: context.integrationId,
    status,
  });

/**
 * A channel's candidates that FrontDesk doesn't know yet, newest first.
 * Known threads are skipped without spending allowance, so a repeat import
 * reaches further back in history.
 *
 * @yields {ThreadImportCandidate} Unknown candidates in the channel's own order.
 */
async function* unknownThreads(
  context: ThreadImportContext,
  pages: AsyncIterable<ThreadImportCandidate[]>
): AsyncGenerator<ThreadImportCandidate> {
  for await (const page of pages) {
    if (page.length === 0) {
      continue;
    }
    const { externalThreadIds } =
      await context.fetchClient.mutate.ingest.unknownExternalThreads({
        externalThreadIds: page.map((c) => c.externalThreadId),
        integrationId: context.integrationId,
        provider: context.provider,
      });
    const unknown = new Set(externalThreadIds);
    yield* page.filter((c) => unknown.has(c.externalThreadId));
  }
}

/**
 * Merge per-channel streams into one newest-first stream, reading lazily so
 * a run only fetches as much history as it imports. A channel that fails to
 * list is dropped and reported through `onChannelError`.
 *
 * @yields {ThreadImportCandidate} Candidates across all channels, newest first.
 */
async function* newestFirst(
  channels: AsyncGenerator<ThreadImportCandidate>[],
  onChannelError: (error: unknown) => void
): AsyncGenerator<ThreadImportCandidate> {
  const advance = async (channel: AsyncGenerator<ThreadImportCandidate>) => {
    try {
      const next = await channel.next();
      return next.done ? null : { candidate: next.value, channel };
    } catch (error) {
      onChannelError(error);
      return null;
    }
  };
  const heads = (await Promise.all(channels.map(advance))).filter(
    (head) => head !== null
  );
  while (heads.length > 0) {
    let newest = 0;
    for (const [index, head] of heads.entries()) {
      if (
        head.candidate.startedAt > (heads[newest]?.candidate.startedAt ?? 0)
      ) {
        newest = index;
      }
    }
    const [head] = heads.splice(newest, 1);
    if (!head) {
      return;
    }
    yield head.candidate;
    const next = await advance(head.channel);
    if (next) {
      heads.push(next);
    }
  }
}

/**
 * Run one import for an integration: walk the threads FrontDesk doesn't have,
 * newest first, importing each complete thread until the organization's
 * allowance is spent or history runs out. Threads that fail or have nothing
 * eligible don't spend allowance, so the run keeps going past them. The core
 * enforces the allowance on every thread; the up-front read only paces the
 * run and sizes its progress.
 *
 * The source is resolved inside the run so a provider that can't be reached
 * still ends in a reported `done` (with a failure) instead of the last state.
 * `null` means there is nothing to read (no install or no channels).
 */
export const runThreadImport = async (
  context: ThreadImportContext,
  resolveSource: () => Promise<ThreadImportSource | null>
): Promise<void> => {
  const startedAt = new Date().toISOString();
  let failed = 0;
  let imported = 0;
  let exhausted = false;

  try {
    await report(context, { startedAt, state: "finding" });

    const source = await resolveSource();
    if (!source) {
      return;
    }

    const { remaining } =
      await context.fetchClient.mutate.ingest.threadImportAllowance({
        integrationId: context.integrationId,
      });

    const candidates = newestFirst(
      source.channels.map((pages) => unknownThreads(context, pages)),
      (error) => {
        console.error(
          `[thread-import] Failed to list a channel for integration ${context.integrationId}:`,
          error
        );
        failed += 1;
      }
    );

    for await (const candidate of candidates) {
      if (remaining !== null && imported >= remaining) {
        // An eligible-looking thread is left and the allowance is spent.
        exhausted = true;
        break;
      }
      // Progress is best-effort; a missed update must not stop the import.
      await report(context, {
        failed,
        imported,
        startedAt,
        state: "importing",
        total: remaining,
      }).catch((error) => {
        console.error(
          `[thread-import] Failed to report progress for integration ${context.integrationId}:`,
          error
        );
      });

      try {
        const payload = await source.load(candidate);
        if (!payload) {
          continue;
        }
        const { outcome } =
          await context.fetchClient.mutate.ingest.importThread({
            ...payload,
            integrationId: context.integrationId,
            provider: context.provider,
          });
        if (outcome === "imported") {
          imported += 1;
        } else if (outcome === "exhausted") {
          exhausted = true;
          break;
        }
      } catch (error) {
        console.error(
          `[thread-import] Failed to import ${context.provider} thread ${candidate.externalThreadId}:`,
          error
        );
        failed += 1;
      }
    }
  } catch (error) {
    // The job isn't retried (Import again is the recovery), so the error
    // ends here as a reported failure.
    console.error(
      `[thread-import] Import failed for integration ${context.integrationId}:`,
      error
    );
    failed += 1;
  } finally {
    await report(context, {
      exhausted,
      failed,
      finishedAt: new Date().toISOString(),
      imported,
      startedAt,
      state: "done",
    }).catch((error) => {
      console.error(
        `[thread-import] Failed to report the result for integration ${context.integrationId}:`,
        error
      );
    });
  }
};

/**
 * Start the connector's import worker. `resolveSource` builds the provider
 * source for the integration, or returns `null` when there is nothing to read
 * (no install, no selected channels): the run then finishes empty. A throw is
 * reported as a failed run.
 */
export const startThreadImportWorker = (options: {
  fetchClient: LiveStateFetchClient;
  provider: string;
  resolveSource: (
    job: ThreadImportJobData
  ) => Promise<ThreadImportSource | null>;
}): Worker<ThreadImportJobData> =>
  createWorker<ThreadImportJobData>(
    threadImportQueueName(options.provider),
    async (job) => {
      await runThreadImport(
        {
          fetchClient: options.fetchClient,
          integrationId: job.data.integrationId,
          provider: options.provider,
        },
        () => options.resolveSource(job.data)
      );
    },
    // Imports are sequential per connector process; provider rate limits
    // matter more than throughput for a one-off history read.
    { concurrency: 1 }
  );
