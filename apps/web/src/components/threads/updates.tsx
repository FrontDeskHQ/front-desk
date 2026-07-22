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
import { Bot, CircleUserIcon, CopySlash, Github, Tag } from "lucide-react";

import { ThreadChipWithSummary } from "~/components/chips";
import {
  resolveMirrorEntityLabel,
  useMirrorEntityByKey,
} from "~/components/threads/external-entities";
import { query } from "~/lib/live-state";
import { buildThreadParam } from "~/utils/thread";

const getMetadataString = (
  metadata: Record<string, unknown> | null,
  key: string
): string | null => {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
};

const useResolvedMirrorLabel = (
  externalKey: string | null,
  metadata: Record<string, unknown> | null,
  fallbackKey: string
): string | null => {
  const entity = useMirrorEntityByKey(externalKey);
  return resolveMirrorEntityLabel(
    entity,
    getMetadataString(metadata, fallbackKey)
  );
};

const IssueChangedUpdateText = ({
  metadata,
}: {
  metadata: Record<string, unknown> | null;
}) => {
  const oldIssueLabel = useResolvedMirrorLabel(
    getMetadataString(metadata, "oldIssueId"),
    metadata,
    "oldIssueLabel"
  );
  const newIssueLabel = useResolvedMirrorLabel(
    getMetadataString(metadata, "newIssueId"),
    metadata,
    "newIssueLabel"
  );

  if (!oldIssueLabel && newIssueLabel) {
    return (
      <>
        linked issue <span className="text-foreground">{newIssueLabel}</span>
      </>
    );
  }

  if (oldIssueLabel && !newIssueLabel) {
    return (
      <>
        unlinked issue <span className="text-foreground">{oldIssueLabel}</span>
      </>
    );
  }

  if (oldIssueLabel && newIssueLabel) {
    return (
      <>
        changed issue from{" "}
        <span className="text-foreground">{oldIssueLabel}</span> to{" "}
        <span className="text-foreground">{newIssueLabel}</span>
      </>
    );
  }

  return "changed issue";
};

const PrChangedUpdateText = ({
  metadata,
  verbPrefix,
}: {
  metadata: Record<string, unknown> | null;
  verbPrefix: string;
}) => {
  const oldPrLabel = useResolvedMirrorLabel(
    getMetadataString(metadata, "oldPrId"),
    metadata,
    "oldPrLabel"
  );
  const newPrLabel = useResolvedMirrorLabel(
    getMetadataString(metadata, "newPrId"),
    metadata,
    "newPrLabel"
  );

  if (!oldPrLabel && newPrLabel) {
    return (
      <>
        {verbPrefix}linked PR{" "}
        <span className="text-foreground">{newPrLabel}</span>
      </>
    );
  }

  if (oldPrLabel && !newPrLabel) {
    return (
      <>
        unlinked PR <span className="text-foreground">{oldPrLabel}</span>
      </>
    );
  }

  if (oldPrLabel && newPrLabel) {
    return (
      <>
        changed PR from <span className="text-foreground">{oldPrLabel}</span> to{" "}
        <span className="text-foreground">{newPrLabel}</span>
      </>
    );
  }

  return "changed PR";
};

const IssueCreatedUpdateText = ({
  metadata,
}: {
  metadata: Record<string, unknown> | null;
}) => {
  const issueLabel = useResolvedMirrorLabel(
    getMetadataString(metadata, "issueId"),
    metadata,
    "issueLabel"
  );

  return (
    <>
      created issue{" "}
      <span className="text-foreground">{issueLabel ?? "an issue"}</span>
    </>
  );
};

export function Update({
  update,
  user,
  connectTop,
}: {
  update: InferLiveObject<typeof schema.update, { user: true }>;
  user?: { id: string; name: string };
  connectTop?: boolean;
}) {
  let metadata: Record<string, unknown> | null = null;
  if (update.metadataStr) {
    try {
      metadata = JSON.parse(update.metadataStr);
    } catch (error) {
      console.error("Error parsing update metadata:", error);
    }
  }

  const assignedUser = useLiveQuery(
    query.user.first({
      id:
        typeof metadata?.newAssignedUserId === "string"
          ? metadata.newAssignedUserId
          : undefined,
    })
  );

  const duplicateThread = useLiveQuery(
    query.thread.first({ id: metadata?.duplicateOfThreadId }).include({
      assignedUser: { include: { user: true } },
      author: { include: { user: true } },
    })
  );

  const isAutonomous = metadata?.source === "autonomous";
  const isAutonomousUndo = metadata?.source === "autonomous_undo";
  const verbPrefix = isAutonomous
    ? "auto-"
    : isAutonomousUndo
      ? "undid auto-"
      : "";

  const getUpdateText = () => {
    if (update.type === "label_changed") {
      const action = metadata?.action === "removed" ? "removed" : "applied";
      return (
        <>
          {verbPrefix}
          {action === "applied" ? "labeled as " : "removed label "}
          <span className="text-foreground">
            {metadata?.labelName ?? "label"}
          </span>
        </>
      );
    }

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
          {verbPrefix}changed status to{" "}
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
      return <IssueChangedUpdateText metadata={metadata} />;
    }

    if (update.type === "pr_changed") {
      return (
        <PrChangedUpdateText metadata={metadata} verbPrefix={verbPrefix} />
      );
    }

    // `github_issue_created` is the legacy type kept for existing rows; new
    // rows use the provider-neutral `issue_created` from generic dispatch.
    if (
      update.type === "issue_created" ||
      update.type === "github_issue_created"
    ) {
      return <IssueCreatedUpdateText metadata={metadata} />;
    }

    if (update.type === "marked_duplicate") {
      return (
        <span className="inline-flex items-center gap-1">
          {verbPrefix}marked as duplicate of{" "}
          {duplicateThread ? (
            <ThreadChipWithSummary
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

  const isFrontDesk = isAutonomous || isAutonomousUndo;
  const actorName = isFrontDesk
    ? "FrontDesk"
    : (update.user?.name ?? metadata?.userName ?? "Someone");

  return (
    <div className="flex gap-2 items-center text-xs text-muted-foreground">
      <div className="relative flex items-center justify-center size-4 shrink-0">
        {connectTop && (
          <span className="absolute left-1/2 -top-0.5 h-3 w-px -translate-x-1/2 -translate-y-full bg-border" />
        )}
        {isFrontDesk ? (
          <Bot className="size-3.5" />
        ) : (
          <>
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
            {(update.type === "issue_created" ||
              update.type === "github_issue_created") && (
              <Github className="size-3.5" />
            )}
            {update.type === "marked_duplicate" && (
              <CopySlash className="size-3.5" />
            )}
            {update.type === "label_changed" && <Tag className="size-3.5" />}
          </>
        )}
      </div>
      <span>
        <span className="text-foreground">{actorName}</span> {getUpdateText()}
      </span>
      {isFrontDesk && metadata?.signalId && (
        <Link
          to="/app/signal"
          className="text-foreground underline-offset-2 hover:underline"
        >
          [view signal]
        </Link>
      )}
      <span>·</span>
      <span>{formatRelativeTime(update.createdAt)}</span>
    </div>
  );
}
