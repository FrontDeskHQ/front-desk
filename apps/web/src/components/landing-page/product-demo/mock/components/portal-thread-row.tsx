import { Avatar } from "@workspace/ui/components/avatar";
import { PriorityIndicator, StatusIndicator } from "@workspace/ui/components/indicator";
import { LabelBadge } from "@workspace/ui/components/label-badge";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import { motion } from "motion/react";
import { blurSlideItemVariants } from "../motion-variants";
import type { DemoThread } from "../types";

type MockPortalThreadRowProps = {
  thread: DemoThread;
  isSimulatedHover?: boolean;
};

export const MockPortalThreadRow = ({
  thread,
  isSimulatedHover,
}: MockPortalThreadRowProps) => {
  // Simulate the portal's message content structure
  const lastMessageContent = thread.lastMessage.content;

  return (
    <motion.div
      variants={blurSlideItemVariants}
      className={[
        "w-full max-w-5xl flex flex-col p-3 gap-2 rounded-md",
        "transition-all duration-300",
        "hover:bg-muted/50 hover:shadow-sm hover:-translate-y-px",
        isSimulatedHover ? "bg-muted/50 shadow-sm -translate-y-px" : "bg-transparent",
      ].join(" ")}
    >
      <div className="flex justify-between">
        <div className="flex items-center gap-2">
          <Avatar
            variant="user"
            size="md"
            fallback={thread.authorName}
          />
          <div>{thread.title}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-1">
            {thread.labels
              .filter((label) => label.name)
              .map((label) => (
                <LabelBadge
                  key={`${thread.id}_${label.name}`}
                  name={label.name}
                  color={label.color}
                />
              ))}
          </div>
          <PriorityIndicator priority={thread.priority} />
          <StatusIndicator status={thread.status} />
        </div>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground min-w-0 flex-1 text-nowrap font-medium truncate max-w-2xl">
          {thread.lastMessage.authorName}
          :&nbsp;
          <span className="max-w-full">
            {lastMessageContent}
          </span>
        </span>
        <div className="text-muted-foreground flex-shrink-0">
          {formatRelativeTime(thread.createdAt)}
        </div>
      </div>
    </motion.div>
  );
};

