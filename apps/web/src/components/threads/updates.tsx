import type { InferLiveObject } from "@live-state/sync";
import { useLiveQuery } from "@live-state/sync/client";
import { Avatar } from "@workspace/ui/components/avatar";
import {
  PriorityIndicator,
  StatusIndicator,
} from "@workspace/ui/components/indicator";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import type { schema } from "api/schema";
import { CircleUserIcon, Github } from "lucide-react";
import { query } from "~/lib/live-state";

export function Update({
  update,
  user,
}: {
  update: InferLiveObject<typeof schema.update, { user: true }>;
  user?: { id: string; name: string };
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

  const getUpdateText = () => {
    if (update.type === "assigned_changed") {
      if (user?.id && metadata?.newAssignedUserId === user.id) {
        return `self-assigned the thread`;
      }

      if (!metadata?.newAssignedUserName) {
        return `unassigned the thread`;
      }

      return `assigned the thread to ${metadata?.newAssignedUserName}`;
    }

    if (update.type === "status_changed") {
      return `changed status to ${metadata?.newStatusLabel}`;
    }

    if (update.type === "priority_changed") {
      return `changed priority to ${metadata?.newPriorityLabel}`;
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
  };

  return (
    <div className="flex gap-1.5 items-center">
      <div className="flex items-center justify-center rounded-full border size-7 mr-0.5">
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
            <CircleUserIcon className="size-4" />
          ))}
        {update.type === "issue_changed" && <Github className="size-4" />}
      </div>
      <span className="text-xs text-muted-foreground">
        <span className="text-foreground">
          {update.user?.name ?? metadata?.userName ?? "Someone"}
        </span>{" "}
        {getUpdateText()}
      </span>
      <div className="size-0.5 rounded-full bg-muted-foreground"></div>
      <span className="text-xs text-muted-foreground">
        {formatRelativeTime(update.createdAt)}
      </span>
    </div>
  );
}
