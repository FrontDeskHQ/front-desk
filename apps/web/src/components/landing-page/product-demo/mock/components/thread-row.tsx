import { Avatar } from "@workspace/ui/components/avatar";
import {
  PriorityIndicator,
  StatusIndicator,
} from "@workspace/ui/components/indicator";
import { LabelBadge } from "@workspace/ui/components/label-badge";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import { CircleUser } from "lucide-react";
import { motion } from "motion/react";
import { blurSlideItemVariants } from "../motion-variants";
import type { DemoThread } from "../types";

type MockThreadRowProps = {
  thread: DemoThread;
  isSimulatedHover?: boolean;
};

export const MockThreadRow = ({
  thread,
  isSimulatedHover,
}: MockThreadRowProps) => {
  return (
    <motion.div
      variants={blurSlideItemVariants}
      className={`w-full max-w-5xl flex flex-col p-3 gap-2 rounded-md transition-colors duration-300 ${isSimulatedHover ? "bg-muted/50" : "bg-transparent"}`}
    >
      <div className="flex justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar variant="user" size="md" fallback={thread.authorName} />
          <div className="truncate">{thread.title}</div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden md:flex items-center gap-1.5 mr-1">
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
            <CircleUser
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          )}

          <PriorityIndicator priority={thread.priority} />
          <StatusIndicator status={thread.status} />
        </div>
      </div>

      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground min-w-0 flex-1 text-nowrap font-medium truncate max-w-2xl">
          <span className="font-medium">
            {thread.lastMessage.authorName}:&nbsp;
          </span>
          <span className="truncate">{thread.lastMessage.content}</span>
        </span>
        <div className="text-muted-foreground shrink-0">
          {formatRelativeTime(thread.createdAt)}
        </div>
      </div>
    </motion.div>
  );
};
