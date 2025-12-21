import { Avatar } from "@workspace/ui/components/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  PriorityIndicator,
  PriorityText,
  StatusIndicator,
  StatusText,
} from "@workspace/ui/components/indicator";
import { LabelBadge } from "@workspace/ui/components/label-badge";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import {
  ArrowUp,
  CircleUser,
  MoreHorizontalIcon,
  PlusIcon,
  TagIcon,
} from "lucide-react";
import { motion } from "motion/react";
import {
  blurSlideContainerVariants,
  blurSlideItemVariants,
} from "../motion-variants";
import type { DemoThread } from "../types";

type MockThreadDetailPageProps = {
  thread: DemoThread;
};

export const MockThreadDetailPage = ({ thread }: MockThreadDetailPageProps) => {
  const assignedName = thread.assignedUserName ?? "Unassigned";

  return (
    <div className="flex-1 p-2 pl-0">
      <Card className="flex flex-row size-full">
        <div className="flex-1 flex flex-col">
          <CardHeader>
            <CardTitle>
              <div className="flex justify-between items-center w-full gap-4">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink className="text-muted-foreground">
                        Threads
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbLink className="text-foreground truncate max-w-[28rem]">
                        {thread.title}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
                <Button variant="ghost" aria-label="Open menu (demo)" size="sm">
                  <MoreHorizontalIcon aria-hidden="true" />
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <div className="flex flex-col p-4 gap-4 flex-1 w-full max-w-5xl mx-auto overflow-hidden">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={blurSlideContainerVariants}
              className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto"
              aria-label="Thread messages (demo)"
            >
              <motion.div
                variants={blurSlideItemVariants}
                className="rounded-lg border bg-background-secondary"
              >
                <CardHeader size="sm" className="px-2">
                  <CardTitle className="gap-2">
                    <Avatar
                      variant="user"
                      size="md"
                      fallback={thread.authorName}
                    />
                    <p>{thread.authorName}</p>
                    <p className="text-muted-foreground">
                      {formatRelativeTime(thread.createdAt)}
                    </p>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm leading-relaxed">
                    {thread.lastMessage.content}
                  </div>
                </CardContent>
              </motion.div>
              <motion.div
                variants={blurSlideItemVariants}
                className="rounded-lg border bg-background-secondary"
              >
                <CardHeader size="sm" className="px-2">
                  <CardTitle className="gap-2">
                    <Avatar variant="user" size="md" fallback={assignedName} />
                    <p>{assignedName}</p>
                    <p className="text-muted-foreground">Just now</p>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm leading-relaxed">
                    I&apos;m taking a look now. Can you share a screenshot and
                    the steps you followed?
                  </div>
                </CardContent>
              </motion.div>
            </motion.div>
            <div className="border-input border rounded-md px-4 py-2 flex flex-col gap-2 cursor-text relative transition-[color,box-shadow] bottom-2.5 w-full shadow-lg bg-[#1B1B1E]">
              <div className="customProse placeholder:text-muted-foreground text-sm text-muted-foreground">
                Write a reply...
              </div>
              <div className="flex justify-end">
                <Button size="sm" disabled variant="secondary">
                  <ArrowUp />
                  Reply
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="w-64 border-l bg-muted/25 flex flex-col p-4 gap-4">
          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground text-xs">Properties</div>
            <div className="flex flex-col gap-1.5">
              <div className="text-sm px-1.5 max-w-40 py-1 w-full flex items-center gap-2">
                <div className="flex items-center justify-center size-4">
                  <StatusIndicator status={thread.status} />
                </div>
                <StatusText status={thread.status} />
              </div>
              <div className="text-sm px-1.5 max-w-40 py-1 w-full flex items-center gap-2">
                <div className="flex items-center justify-center size-4">
                  <PriorityIndicator priority={thread.priority} />
                </div>
                <PriorityText priority={thread.priority} />
              </div>
              <div
                className={`text-sm px-1.5 max-w-40 py-1 w-full flex items-center gap-2 ${
                  thread.assignedUserName
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                <div className="flex items-center justify-center size-4">
                  {thread.assignedUserName ? (
                    <Avatar variant="user" size="md" fallback={assignedName} />
                  ) : (
                    <CircleUser className="size-4" />
                  )}
                </div>
                {assignedName}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-foreground-secondary text-xs">Labels</div>
              <div className="flex flex-col gap-1.5">
                {thread.labels.length > 0 ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    {thread.labels.map((label) => (
                      <LabelBadge
                        key={`${thread.id}_${label.name}`}
                        name={label.name}
                        color={label.color}
                      />
                    ))}
                    <div className="size-6 flex items-center justify-center">
                      <PlusIcon className="size-4 text-foreground-secondary" />
                    </div>
                  </div>
                ) : (
                  <div className="justify-start text-sm px-2 w-full py-1 max-w-40 flex items-center gap-2">
                    <TagIcon className="size-4 text-foreground-secondary" />
                    <span className="text-foreground-secondary">
                      Add labels
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
