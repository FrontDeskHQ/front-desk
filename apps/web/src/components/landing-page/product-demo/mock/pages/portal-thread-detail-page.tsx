import { Avatar } from "@workspace/ui/components/avatar";
import { RichText } from "@workspace/ui/components/blocks/tiptap";
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
import { safeParseJSON } from "@workspace/ui/lib/tiptap";
import { formatRelativeTime } from "@workspace/ui/lib/utils";
import { ArrowUp, CircleUser } from "lucide-react";
import { motion } from "motion/react";
import {
  blurSlideContainerVariants,
  blurSlideItemVariants,
} from "../motion-variants";
import { PortalLayout } from "../portal-layout";
import type { DemoThread } from "../types";

type MockPortalThreadDetailPageProps = {
  thread: DemoThread;
};

export const MockPortalThreadDetailPage = ({
  thread,
}: MockPortalThreadDetailPageProps) => {
  return (
    <PortalLayout activeNavItem="Support">
      <div className="flex flex-col size-full gap-4 sm:gap-8">
        <div className="flex flex-col flex-1 px-4 py-4 sm:py-8 sm:px-8">
          <div className="flex flex-1 justify-center">
            <div className="grow shrink max-w-0 2xl:max-w-64" />
            <Card className="w-full grow shrink flex flex-col max-w-5xl">
              <CardHeader>
                <CardTitle>
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                          <div className="cursor-pointer">Threads</div>
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbLink asChild className="text-white">
                          <div className="cursor-pointer">{thread.title}</div>
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>
                </CardTitle>
              </CardHeader>
              <div className="flex flex-col p-4 gap-4 flex-1 w-full max-w-5xl mx-auto overflow-hidden">
                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={blurSlideContainerVariants}
                  className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto"
                  aria-label="Public thread messages (demo)"
                >
                  <motion.div variants={blurSlideItemVariants}>
                    <Card>
                      <CardHeader size="sm" className="px-2">
                        <CardTitle>
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
                        <RichText
                          content={safeParseJSON(thread.lastMessage.content)}
                        />
                      </CardContent>
                    </Card>
                  </motion.div>

                  <motion.div variants={blurSlideItemVariants}>
                    <Card>
                      <CardHeader size="sm" className="px-2">
                        <CardTitle>
                          <Avatar
                            variant="user"
                            size="md"
                            fallback="Daniel Moura"
                          />
                          <p>Daniel Moura</p>
                          <p className="text-muted-foreground">Just now</p>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <RichText
                          content={safeParseJSON(
                            "Hi Maya, can you check if desired channel is selected in the Discord integration settings?",
                          )}
                        />
                      </CardContent>
                    </Card>
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
            </Card>
            <div className="grow shrink-0 md:flex hidden max-w-64 flex-col gap-4 p-4">
              <div className="flex flex-col gap-2">
                <div className="text-muted-foreground text-xs">
                  Thread properties
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex px-1.5 gap-2 items-center">
                    <div className="flex items-center justify-center size-4">
                      <StatusIndicator status={thread.status ?? 0} />
                    </div>
                    <StatusText status={thread.status ?? 0} />
                  </div>
                  <div className="flex px-1.5 gap-2 items-center">
                    <div className="flex items-center justify-center size-4">
                      <PriorityIndicator priority={thread.priority ?? 0} />
                    </div>
                    <PriorityText priority={thread.priority ?? 0} />
                  </div>
                  <div className="flex px-1.5 gap-2 items-center">
                    <div className="flex items-center justify-center size-4">
                      {thread.assignedUserName ? (
                        <Avatar
                          variant="user"
                          size="md"
                          fallback={thread.assignedUserName}
                        />
                      ) : (
                        <CircleUser className="size-4" />
                      )}
                    </div>
                    <p>{thread.assignedUserName ?? "Unassigned"}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="text-muted-foreground text-xs">Labels</div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {thread.labels?.map((label) => (
                      <LabelBadge
                        key={label.name}
                        name={label.name}
                        color={label.color}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
};
