import type { InferLiveObject } from "@live-state/sync";
import { useLiveQuery } from "@live-state/sync/client";
import { Avatar } from "@workspace/ui/components/avatar";
import {
  PriorityIndicator,
  StatusIndicator,
} from "@workspace/ui/components/indicator";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import type { schema } from "api/schema";
import { CircleUserIcon } from "lucide-react";
import { query } from "~/lib/live-state";

export function Update({
  update,
  user,
}: {
  update: InferLiveObject<typeof schema.update, { user: true }>;
  user?: { id: string; name: string };
}) {
  const metadata = update.metadataStr ? JSON.parse(update.metadataStr) : null;

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
      </div>
      <span className="text-xs text-muted-foreground">
        <span className="text-foreground">
          {update.user?.name ?? "Someone"}
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
