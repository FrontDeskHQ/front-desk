import type { InferLiveObject } from "@live-state/sync";
import { useLiveQuery } from "@live-state/sync/client";
import { Link } from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import {
  PriorityIndicator,
  StatusIndicator,
} from "@workspace/ui/components/indicator";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import type { schema } from "api/schema";
import { CircleUserIcon, CopySlash, Github } from "lucide-react";
import { ThreadChip } from "~/components/chips";
import { query } from "~/lib/live-state";
import { buildThreadParam } from "~/utils/thread";

export function Update({
  update,
  user,
  connectTop,
}: {
  update: InferLiveObject<typeof schema.update, { user: true }>;
  user?: { id: string; name: string };
  connectTop?: boolean;
}) {
  let metadata: any = null;
  if (update.metadataStr) {
    try {
      metadata = JSON.parse(update.metadataStr);
    } catch (error) {
      console.error("Error parsing update metadata:", error);
    }
  }

  const assignedUser = useLiveQuery(
    query.user.first({ id: metadata?.newAssignedUserId }),
  );

  const duplicateThread = useLiveQuery(
    query.thread
      .first({ id: metadata?.duplicateOfThreadId })
      .include({ author: { include: { user: true } }, assignedUser: true }),
  );

  const getUpdateText = () => {
    if (update.type === "assigned_changed") {
      if (user?.id && metadata?.newAssignedUserId === user.id) {
        return `self-assigned the thread`;
      }

      if (!metadata?.newAssignedUserName) {
        return `unassigned the thread`;
      }

      return (
        <>
          assigned the thread to{" "}
          <span className="text-foreground">
            {metadata?.newAssignedUserName}
          </span>
        </>
      );
    }

    if (update.type === "status_changed") {
      return (
        <>
          changed status to{" "}
          <span className="text-foreground">{metadata?.newStatusLabel}</span>
        </>
      );
    }

    if (update.type === "priority_changed") {
      return (
        <>
          changed priority to{" "}
          <span className="text-foreground">{metadata?.newPriorityLabel}</span>
        </>
      );
    }

    if (update.type === "issue_changed") {
      if (!metadata?.oldIssueLabel && metadata?.newIssueLabel) {
        return (
          <>
            linked issue{" "}
            <span className="text-foreground">{metadata.newIssueLabel}</span>
          </>
        );
      }

      if (metadata?.oldIssueLabel && !metadata?.newIssueLabel) {
        return (
          <>
            unlinked issue{" "}
            <span className="text-foreground">{metadata.oldIssueLabel}</span>
          </>
        );
      }

      if (metadata?.oldIssueLabel && metadata?.newIssueLabel) {
        return (
          <>
            changed issue from{" "}
            <span className="text-foreground">{metadata.oldIssueLabel}</span> to{" "}
            <span className="text-foreground">{metadata.newIssueLabel}</span>
          </>
        );
      }

      return `changed issue`;
    }

    if (update.type === "pr_changed") {
      if (!metadata?.oldPrLabel && metadata?.newPrLabel) {
        return (
          <>
            linked PR{" "}
            <span className="text-foreground">{metadata.newPrLabel}</span>
          </>
        );
      }

      if (metadata?.oldPrLabel && !metadata?.newPrLabel) {
        return (
          <>
            unlinked PR{" "}
            <span className="text-foreground">{metadata.oldPrLabel}</span>
          </>
        );
      }

      if (metadata?.oldPrLabel && metadata?.newPrLabel) {
        return (
          <>
            changed PR from{" "}
            <span className="text-foreground">{metadata.oldPrLabel}</span> to{" "}
            <span className="text-foreground">{metadata.newPrLabel}</span>
          </>
        );
      }

      return `changed PR`;
    }

    if (update.type === "github_issue_created") {
      return (
        <>
          created issue{" "}
          <span className="text-foreground">{metadata?.issueLabel}</span>
        </>
      );
    }

    if (update.type === "marked_duplicate") {
      return (
        <span className="inline-flex items-center gap-1">
          marked as duplicate of{" "}
          {duplicateThread ? (
            <ThreadChip
              thread={duplicateThread}
              className="mx-0.5"
              render={
                <Link
                  to="/app/threads/$id"
                  params={{
                    id: buildThreadParam(duplicateThread),
                  }}
                />
              }
            />
          ) : (
            <span className="text-foreground">
              {metadata?.duplicateOfThreadName ?? "another thread"}
            </span>
          )}
        </span>
      );
    }
  };

  return (
    <div className="flex gap-2 items-center text-xs text-muted-foreground">
      <div className="relative flex items-center justify-center size-4 shrink-0">
        {connectTop && (
          <span className="absolute left-1/2 -top-0.5 h-3 w-px -translate-x-1/2 -translate-y-full bg-border" />
        )}
        {update.type === "status_changed" && (
          <StatusIndicator status={metadata?.newStatus as number} />
        )}
        {update.type === "priority_changed" && (
          <PriorityIndicator priority={metadata?.newPriority as number} />
        )}
        {update.type === "assigned_changed" &&
          (assignedUser ? (
            <Avatar variant="user" size="sm" fallback={assignedUser.name} />
          ) : (
            <CircleUserIcon className="size-3.5" />
          ))}
        {update.type === "issue_changed" && <Github className="size-3.5" />}
        {update.type === "pr_changed" && <Github className="size-3.5" />}
        {update.type === "github_issue_created" && (
          <Github className="size-3.5" />
        )}
        {update.type === "marked_duplicate" && (
          <CopySlash className="size-3.5" />
        )}
      </div>
      <span>
        <span className="text-foreground">
          {update.user?.name ?? metadata?.userName ?? "Someone"}
        </span>{" "}
        {getUpdateText()}
      </span>
      <span>·</span>
      <span>{formatRelativeTime(update.createdAt)}</span>
    </div>
  );
}
