import { formatGitHubId } from "@workspace/schemas/external-issue";
import { statusValues } from "@workspace/ui/components/indicator";
import { enqueueEmbedPrJob } from "api/queue";
import { ulid } from "ulid";
import { app, getOctokit } from "../lib/github";
import { store } from "../lib/live-state";
import { STATUS_CLOSED, STATUS_OPEN, STATUS_RESOLVED } from "../utils";

/**
 * Look up the organizationId for a GitHub App installation
 * by matching the installationId stored in integration config.
 */
const findOrganizationByInstallationId = (
  installationId: number,
): string | null => {
  const integrations = store.query.integration.get();
  for (const integration of integrations) {
    if (integration.type !== "github" || !integration.configStr) continue;
    try {
      const config = JSON.parse(integration.configStr);
      if (config.installationId === installationId) {
        return integration.organizationId;
      }
    } catch {
      continue;
    }
  }
  return null;
};

export const setupWebhooks = () => {
  app.webhooks.on("issues.closed", async ({ payload }) => {
    try {
      const issueId = formatGitHubId(
        payload.issue.id,
        payload.repository.owner.login,
        payload.repository.name
      );
      const issueNumber = payload.issue.number;
      const repoFullName = payload.repository.full_name;

      const linkedThreads = store.query.thread
        .where({ externalIssueId: issueId })
        .get();

      if (linkedThreads.length === 0) {
        console.log(`[GitHub] No threads linked to issue ${issueId}`);
        return;
      }

      for (const thread of linkedThreads) {
        if (thread.status === STATUS_CLOSED) {
          console.log(
            `[GitHub] Thread ${thread.id} is already closed, skipping status update`
          );
          continue;
        }

        const oldStatus = thread.status ?? STATUS_OPEN;
        const newStatus = STATUS_RESOLVED;

        console.log(
          `[GitHub] Updating thread ${thread.id} status from ${statusValues[oldStatus]?.label} to ${statusValues[newStatus]?.label}`
        );

        store.mutate.thread.update(thread.id, {
          status: newStatus,
        });

        store.mutate.update.create({
          id: ulid().toLowerCase(),
          threadId: thread.id,
          type: "status_changed",
          createdAt: new Date(),
          userId: null,
          metadataStr: JSON.stringify({
            oldStatus,
            newStatus,
            oldStatusLabel: statusValues[oldStatus]?.label,
            newStatusLabel: statusValues[newStatus]?.label,
            source: "github",
            issueNumber,
            repoFullName,
            userName: "GitHub Integration",
          }),
          // Mark as replicated from GitHub so it doesn't sync back
          replicatedStr: JSON.stringify({ github: true }),
        });
      }
    } catch (error) {
      console.error("[GitHub] Error handling issues.closed webhook:", error);
    }
  });

  app.webhooks.on("pull_request.closed", async ({ payload }) => {
    try {
      const pr = payload.pull_request;
      const prNumber = pr.number;
      const repoFullName = payload.repository.full_name;
      const merged = pr.merged;
      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;

      console.log(
        `[GitHub] Pull request ${
          merged ? "merged" : "closed"
        }: ${repoFullName}#${prNumber}`
      );

      // Enqueue PR embedding job for merged, non-draft PRs
      if (merged && !pr.draft) {
        const installationId = payload.installation?.id;
        if (installationId) {
          const organizationId =
            findOrganizationByInstallationId(installationId);
          if (organizationId) {
            try {
              const octokit = await getOctokit(installationId);
              const { data: commits } = await octokit.request(
                "GET /repos/{owner}/{repo}/pulls/{pull_number}/commits",
                {
                  owner,
                  repo,
                  pull_number: prNumber,
                  per_page: 100,
                },
              );
              const commitMessages = commits.map(
                (c) => c.commit.message,
              );

              const jobId = await enqueueEmbedPrJob({
                prId: pr.id,
                prNumber,
                owner,
                repo,
                prUrl: pr.html_url,
                prTitle: pr.title,
                prBody: pr.body ?? "",
                commitMessages,
                organizationId,
                mergedAt: pr.merged_at ?? new Date().toISOString(),
              });

              if (!jobId) {
                throw new Error("enqueueEmbedPrJob returned null — queue unavailable");
              }

              console.log(
                `[GitHub] Enqueued embed-pr job ${jobId} for ${repoFullName}#${prNumber}`,
              );
            } catch (embedError) {
              console.error(
                `[GitHub] Failed to enqueue embed-pr job for ${repoFullName}#${prNumber}:`,
                embedError,
              );
            }
          } else {
            console.warn(
              `[GitHub] No organization found for installation ${installationId}, skipping PR embedding`,
            );
          }
        }
      }

      // Update linked thread statuses
      const prId = formatGitHubId(
        pr.id,
        owner,
        repo,
      );

      const linkedThreads = store.query.thread
        .where({ externalPrId: prId })
        .get();

      if (linkedThreads.length === 0) {
        console.log(`[GitHub] No threads linked to PR ${prId}`);
        return;
      }

      for (const thread of linkedThreads) {
        if (thread.status === STATUS_CLOSED) {
          console.log(
            `[GitHub] Thread ${thread.id} is already closed, skipping status update`
          );
          continue;
        }

        const oldStatus = thread.status ?? STATUS_OPEN;
        const newStatus = STATUS_RESOLVED;

        console.log(
          `[GitHub] Updating thread ${thread.id} status from ${statusValues[oldStatus]?.label} to ${statusValues[newStatus]?.label}`
        );

        store.mutate.thread.update(thread.id, {
          status: newStatus,
        });

        store.mutate.update.create({
          id: ulid().toLowerCase(),
          threadId: thread.id,
          type: "status_changed",
          createdAt: new Date(),
          userId: null,
          metadataStr: JSON.stringify({
            oldStatus,
            newStatus,
            oldStatusLabel: statusValues[oldStatus]?.label,
            newStatusLabel: statusValues[newStatus]?.label,
            source: "github",
            prNumber,
            repoFullName,
            merged,
            userName: "GitHub Integration",
          }),
          // Mark as replicated from GitHub so it doesn't sync back
          replicatedStr: JSON.stringify({ github: true }),
        });
      }
    } catch (error) {
      console.error(
        "[GitHub] Error handling pull_request.closed webhook:",
        error
      );
    }
  });

  app.webhooks.onAny(async ({ name, payload }) => {
    const action = "action" in payload ? payload.action : undefined;
    const repo =
      "repository" in payload ? payload.repository?.full_name : undefined;
    console.log(
      `[GitHub] Received webhook: ${name}${action ? ` (${action})` : ""}${
        repo ? ` from ${repo}` : ""
      }`
    );
  });

  app.webhooks.onError((error) => {
    console.error(error);
  });
};
