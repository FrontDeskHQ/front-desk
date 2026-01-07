import { statusValues } from "@workspace/ui/components/indicator";
import { ulid } from "ulid";
import { app } from "../lib/github";
import { store } from "../lib/live-state";
import { STATUS_CLOSED, STATUS_OPEN, STATUS_RESOLVED } from "../utils";

export const setupWebhooks = () => {
  app.webhooks.on("issues.closed", async ({ payload }) => {
    try {
      const issueId = payload.issue.id.toString();
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

        store.mutate.update.insert({
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
      const prId = payload.pull_request.id.toString();
      const prNumber = payload.pull_request.number;
      const repoFullName = payload.repository.full_name;
      const merged = payload.pull_request.merged;

      console.log(
        `[GitHub] Pull request ${
          merged ? "merged" : "closed"
        }: ${repoFullName}#${prNumber} (ID: ${prId})`
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

        store.mutate.update.insert({
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

  app.webhooks.onAny(async ({ payload }) => {
    console.log("Received event:", payload);
  });

  app.webhooks.onError((error) => {
    console.error(error);
  });
};
