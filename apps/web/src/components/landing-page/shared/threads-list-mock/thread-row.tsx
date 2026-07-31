/* mirror: thread list row — apps/web/src/routes/app/_workspace/_main/threads/index.tsx
 * fork: apps/web/src/routes/app/_workspace/_main/threads/index.tsx @ 59006b69
 *   why: row is inlined in ThreadsList; pulls live-state thread + Link navigation
 * reuse: Avatar, LabelBadge, PriorityIndicator, StatusIndicator, formatRelativeTime
 * state: one open-inbox row from demoThreads (props)
 * marketing: none
 */

import { Avatar } from "@workspace/ui/components/avatar";
import {
  PriorityIndicator,
  StatusIndicator,
} from "@workspace/ui/components/indicator";
import { LabelBadge } from "@workspace/ui/components/label-badge";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import { CircleUser } from "lucide-react";

import type { DemoThread } from "./types";

interface MockThreadRowProps {
  thread: DemoThread;
}

export function MockThreadRow({ thread }: MockThreadRowProps) {
  return (
    <div className="max-w-5xl flex flex-col p-3 gap-2 mx-auto w-full">
      <div className="flex justify-between">
        <div className="flex items-center gap-2">
          <span className="text-foreground-secondary text-sm tabular-nums">
            #{thread.shortId}
          </span>
          <Avatar variant="user" size="md" fallback={thread.authorName} />
          <div>{thread.title}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-1 max-w-48 md:max-w-sm lg:max-w-md overflow-hidden">
            {thread.labels.map((label) => (
              <LabelBadge
                key={`${thread.id}_${label.name}`}
                name={label.name}
                color={label.color}
              />
            ))}
          </div>
          {thread.assignedUserName ? (
            <Avatar
              variant="user"
              size="md"
              fallback={thread.assignedUserName}
            />
          ) : (
            <CircleUser className="size-4" />
          )}
          <PriorityIndicator priority={thread.priority} />
          <StatusIndicator status={thread.status} />
        </div>
      </div>
      <div className="flex gap-2 justify-between md:gap-0">
        <span className="text-muted-foreground min-w-0 flex-1 text-nowrap font-medium truncate max-w-3xs sm:max-w-lg md:max-w-xl lg:max-w-2xl">
          <span className="font-medium">
            {thread.lastMessage.authorName}:&nbsp;
          </span>
          <span className="truncate">{thread.lastMessage.content}</span>
        </span>
        <div className="text-muted-foreground">
          {formatRelativeTime(thread.createdAt)}
        </div>
      </div>
    </div>
  );
}
