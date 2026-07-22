import { Worker } from "bullmq";
import type { Job } from "bullmq";

import {
  buildIssueFields,
  buildPullRequestFields,
  upsertExternalEntity,
} from "../lib/external-entity";
import type { RepoRef } from "../lib/external-entity";
import { getOctokit } from "../lib/github";
import { BACKFILL_QUEUE, createRedisConnection } from "../lib/queue";
import type { BackfillJobData } from "../lib/queue";

const PER_PAGE = 100;

/**
 * Abort the whole job after this many consecutive upsert failures. Isolated bad
 * items are tolerated (logged + skipped), but a run of back-to-back failures
 * signals a systemic problem (auth, network, DB) — throwing lets BullMQ retry
 * the entire job with backoff instead of silently reporting success.
 */
const MAX_CONSECUTIVE_FAILURES = 10;

interface BackfillTally {
  upserted: number;
  failed: number;
}

class SystemicBackfillError extends Error {
  name = "SystemicBackfillError";
}

/**
 * Page every issue in the repo and upsert it into the mirror. The issues
 * endpoint returns PRs too (they're issues under the hood); those are skipped
 * here and handled by `backfillPullRequests`, which has the PR-only facets.
 *
 * A single failing upsert is logged and skipped rather than thrown: otherwise it
 * would kill the job and force a retry to restart paging from page 1, and a
 * persistently bad item would block the whole repo forever. A run of
 * `MAX_CONSECUTIVE_FAILURES` does abort, so a systemic outage retries the job.
 */
const backfillIssues = async (
  octokit: Awaited<ReturnType<typeof getOctokit>>,
  data: BackfillJobData,
  repo: RepoRef
): Promise<BackfillTally> => {
  const tally: BackfillTally = { failed: 0, upserted: 0 };
  let consecutiveFailures = 0;

  const iterator = octokit.paginate.iterator(
    "GET /repos/{owner}/{repo}/issues",
    {
      owner: data.owner,
      per_page: PER_PAGE,
      repo: data.repo,
      state: "all",
    }
  );

  for await (const { data: page } of iterator) {
    for (const issue of page) {
      if (issue.pull_request) {
        continue;
      }
      try {
        await upsertExternalEntity(
          data.organizationId,
          buildIssueFields(issue, repo)
        );
        tally.upserted++;
        consecutiveFailures = 0;
      } catch (error) {
        tally.failed++;
        consecutiveFailures++;
        console.error(
          `[GitHub] Failed to upsert issue ${repo.fullName}#${issue.number}:`,
          error
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          throw new SystemicBackfillError(
            `Aborting ${repo.fullName} issue backfill after ${consecutiveFailures} consecutive upsert failures`
          );
        }
      }
    }
  }

  return tally;
};

/**
 * Page every pull request in the repo and upsert it into the mirror. The list
 * endpoint omits the `merged` boolean; `buildPullRequestFields` derives it from
 * `merged_at`. Per-item failures are logged and skipped, and a run of
 * `MAX_CONSECUTIVE_FAILURES` aborts the job (see `backfillIssues`).
 */
const backfillPullRequests = async (
  octokit: Awaited<ReturnType<typeof getOctokit>>,
  data: BackfillJobData,
  repo: RepoRef
): Promise<BackfillTally> => {
  const tally: BackfillTally = { failed: 0, upserted: 0 };
  let consecutiveFailures = 0;

  const iterator = octokit.paginate.iterator(
    "GET /repos/{owner}/{repo}/pulls",
    {
      owner: data.owner,
      per_page: PER_PAGE,
      repo: data.repo,
      state: "all",
    }
  );

  for await (const { data: page } of iterator) {
    for (const pr of page) {
      try {
        await upsertExternalEntity(
          data.organizationId,
          buildPullRequestFields(pr, repo)
        );
        tally.upserted++;
        consecutiveFailures = 0;
      } catch (error) {
        tally.failed++;
        consecutiveFailures++;
        console.error(
          `[GitHub] Failed to upsert PR ${repo.fullName}#${pr.number}:`,
          error
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          throw new SystemicBackfillError(
            `Aborting ${repo.fullName} PR backfill after ${consecutiveFailures} consecutive upsert failures`
          );
        }
      }
    }
  }

  return tally;
};

/**
 * Mirror a repo's full issue + PR history. Idempotent: every write goes through
 * the upsert-by-`externalKey` path, so re-running only refreshes existing rows.
 * GitHub rate limits are absorbed by octokit's built-in throttling/retry plus
 * the job-level exponential backoff configured on the queue.
 */
export const handleBackfillJob = async (job: Job<BackfillJobData>) => {
  const { data } = job;
  const repo: RepoRef = {
    fullName: data.fullName,
    name: data.repo,
    owner: data.owner,
  };

  console.log(
    `[GitHub] Backfilling ${data.fullName} (org ${data.organizationId})`
  );

  const octokit = await getOctokit(data.installationId);

  const issues = await backfillIssues(octokit, data, repo);
  const pullRequests = await backfillPullRequests(octokit, data, repo);

  console.log(
    `[GitHub] Backfilled ${data.fullName}: ${issues.upserted} issues ` +
      `(${issues.failed} failed), ${pullRequests.upserted} PRs ` +
      `(${pullRequests.failed} failed)`
  );

  return { issues, pullRequests, repoFullName: data.fullName };
};

/**
 * Start the backfill worker. Called once at app startup alongside the webhook
 * listeners.
 */
export const startBackfillWorker = (): Worker<BackfillJobData> => {
  const worker = new Worker<BackfillJobData>(
    BACKFILL_QUEUE,
    handleBackfillJob,
    {
      concurrency: 2,
      connection: createRedisConnection(),
      removeOnComplete: { age: 24 * 3600, count: 50 },
      removeOnFail: { count: 200 },
    }
  );

  worker.on("completed", (job) => {
    console.log(`[GitHub] Backfill job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[GitHub] Backfill job ${job?.id} failed:`, err);
  });

  worker.on("error", (err) => {
    console.error("[GitHub] Backfill worker error:", err);
  });

  return worker;
};
