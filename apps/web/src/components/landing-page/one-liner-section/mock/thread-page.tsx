/* mirror: open thread — apps/web/src/routes/app/_workspace/_main/threads/$id/index.tsx
 * fork: apps/web/src/routes/app/_workspace/_main/threads/$id/index.tsx @ 6bc9bb29
 *   why: live-state thread query, router params, mutate, auth context
 * reuse: ThreadHeader, ThreadReply, ToolbarActions, Breadcrumb*, CardHeader,
 *   Button, Separator, MockProperties, MockLabels
 * state: webhook thread; customer msg → Agent reply → churn pushback → human
 * marketing: phase-gated fade-up on messages; Churn risk label fade-up;
 *   ThreadToolbar shell (items-center) around ToolbarActions only — full toolbar is coupled
 */

import type { InferLiveObject } from "@live-state/sync";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { Button } from "@workspace/ui/components/button";
import { CardHeader } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { cn } from "@workspace/ui/lib/utils";
import type { schema } from "api/schema";
import { MoreHorizontalIcon } from "lucide-react";

import { ThreadHeader } from "~/components/threads/thread-header";
import { ThreadReply } from "~/components/threads/thread-reply";
import { ToolbarActions } from "~/components/threads/thread-toolbar/toolbar-actions";

import { MESSAGES, threadStateForPhase } from "./data";
import { MockLabels } from "./mock-labels";
import { MockProperties } from "./mock-properties";
import type { MockMessage } from "./types";

const NOOP = () => {};

type AppMessage = InferLiveObject<typeof schema.message, { author: true }>;

function asAppMessage(message: MockMessage): AppMessage {
  return message as unknown as AppMessage;
}

interface ThreadPageProps {
  phase: number;
}

export function ThreadPage({ phase }: ThreadPageProps) {
  const thread = threadStateForPhase(phase);
  const showReplies = phase >= 3;

  return (
    <div className="flex size-full">
      <div className="flex-1 flex flex-col">
        <CardHeader>
          <div className="flex justify-between items-center w-full">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink className="text-muted-foreground">
                    Threads
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="flex items-center gap-1.5">
                    <span>{thread.title}</span>
                    <span className="text-foreground-secondary tabular-nums font-normal">
                      #{thread.shortId}
                    </span>
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <Button variant="ghost" size="sm" className="ml-auto" tabIndex={-1}>
              <MoreHorizontalIcon />
            </Button>
          </div>
        </CardHeader>
        <div className="flex flex-col flex-1 w-full overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-none">
            <div className="flex flex-col min-h-full">
              <div className="flex flex-col gap-4 p-8 w-full max-w-5xl mx-auto flex-1">
                <div
                  className={cn(
                    "flex flex-col gap-4",
                    phase >= 1 ? "fade-up" : "invisible"
                  )}
                >
                  <ThreadHeader
                    title={thread.title}
                    message={asAppMessage(MESSAGES.customer)}
                  />
                </div>

                {showReplies ? (
                  <div className="fade-up flex flex-col gap-4">
                    <Separator />
                    <h2 className="text-base py-2">Replies</h2>
                  </div>
                ) : (
                  <div className="invisible flex flex-col gap-4">
                    <Separator />
                    <h2 className="text-base py-2">Replies</h2>
                  </div>
                )}

                <div className={cn(phase >= 3 ? "fade-up" : "invisible")}>
                  <ThreadReply
                    message={asAppMessage(MESSAGES.agent)}
                    canMarkAsAnswer={false}
                    highlight={false}
                  />
                </div>

                <div className={cn(phase >= 5 ? "fade-up" : "invisible")}>
                  <ThreadReply
                    message={asAppMessage(MESSAGES.pushback)}
                    canMarkAsAnswer={false}
                    highlight={false}
                  />
                </div>

                <div className={cn(phase >= 6 ? "fade-up" : "invisible")}>
                  <ThreadReply
                    message={asAppMessage(MESSAGES.human)}
                    canMarkAsAnswer={false}
                    highlight={false}
                  />
                </div>
              </div>
              <div className="sticky bottom-0 w-full max-w-5xl mx-auto px-8 pb-4">
                {/* ThreadToolbar chrome (items-center) — actions only; full toolbar is live-state coupled */}
                <div className="w-full flex flex-col gap-2.5 items-center">
                  <ToolbarActions
                    mode={null}
                    isResolved={false}
                    onToggleReply={NOOP}
                    onToggleSupportIntelligence={NOOP}
                    onResolve={NOOP}
                    onNext={NOOP}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="w-64 border-l bg-muted/25 flex flex-col p-4 gap-4">
        <MockProperties
          status={thread.status}
          priority={thread.priority}
          assignedUserName={thread.assignedUserName}
        />
        <MockLabels labels={thread.labels} />
      </div>
    </div>
  );
}
