/* mirror: open thread — apps/web/src/routes/app/_workspace/_main/threads/$id/index.tsx
 * fork: apps/web/src/routes/app/_workspace/_main/threads/$id/index.tsx @ 6bc9bb29
 *   why: live-state thread query, router params, mutate, auth context
 * reuse: ThreadHeader, ThreadReply, Breadcrumb*, CardHeader, Button, Separator,
 *   MockProperties, MockLabels, MockThreadToolbar
 * state: from props — typically webhook thread with customer header + agent reply
 * marketing: callers own DesignFrame / inert / role=img; scripted layout keeps
 *   invisible placeholders + fade-up for the hero phase script
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

import { MockLabels } from "./mock-labels";
import { MockProperties } from "./mock-properties";
import {
  MockThreadToolbar,
  type MockToolbarSuggestions,
} from "./mock-toolbar";
import type { MockSiMessage } from "./mock-support-intelligence-chat";
import type { MockMessage, MockThreadState } from "./types";

type AppMessage = InferLiveObject<typeof schema.message, { author: true }>;

function asAppMessage(message: MockMessage): AppMessage {
  return message as unknown as AppMessage;
}

export interface MockReplySlot {
  message: MockMessage;
  /** Phase / reveal gate. Hidden slots are omitted in static layout. */
  visible: boolean;
}

interface MockThreadDetailPageProps {
  thread: MockThreadState;
  headerMessage: MockMessage;
  replies: MockReplySlot[];
  /** scripted: keep invisible placeholders + fade-up (hero). static: omit hidden. */
  layout?: "scripted" | "static";
  headerVisible?: boolean;
  repliesHeadingVisible?: boolean;
  /** Toolbar mode — defaults to null (actions only), or reply/SI when content given. */
  toolbarMode?: "reply" | "support-intelligence" | null;
  /** SI suggestions strip (hidden when toolbarMode is support-intelligence). */
  suggestions?: MockToolbarSuggestions;
  /** TipTap JSON draft for reply mode. */
  replyDraft?: string;
  /** Markdown draft for SI chat Draft Reply. */
  siDraft?: string;
  siMessages?: MockSiMessage[];
  className?: string;
}

function Reveal({
  visible,
  layout,
  className,
  children,
}: {
  visible: boolean;
  layout: "scripted" | "static";
  className?: string;
  children: React.ReactNode;
}) {
  if (layout === "static") {
    if (!visible) {
      return null;
    }
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={cn(visible ? "fade-up" : "invisible", className)}>
      {children}
    </div>
  );
}

export function MockThreadDetailPage({
  thread,
  headerMessage,
  replies,
  layout = "static",
  headerVisible = true,
  repliesHeadingVisible = true,
  toolbarMode = null,
  suggestions,
  replyDraft,
  siDraft,
  siMessages,
  className,
}: MockThreadDetailPageProps) {
  const answerMessage = replies.find(
    (slot) => slot.visible && slot.message.markedAsAnswer
  )?.message;
  const visibleReplies = replies.filter((slot) => slot.visible);
  const showRepliesSection =
    repliesHeadingVisible ||
    visibleReplies.length > 0 ||
    layout === "scripted";

  return (
    <div className={cn("flex size-full", className)}>
      <div className="flex flex-1 flex-col">
        <CardHeader>
          <div className="flex w-full items-center justify-between">
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
                    <span className="font-normal text-foreground-secondary tabular-nums">
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
        <div className="flex w-full flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-none">
            <div className="flex min-h-full flex-col">
              <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-8">
                <Reveal
                  visible={headerVisible}
                  layout={layout}
                  className="flex flex-col gap-4"
                >
                  <ThreadHeader
                    title={thread.title}
                    message={asAppMessage(headerMessage)}
                  />
                </Reveal>

                {showRepliesSection ? (
                  <Reveal
                    visible={repliesHeadingVisible}
                    layout={layout}
                    className="flex flex-col gap-4"
                  >
                    <Separator />
                    {answerMessage ? (
                      <ThreadReply
                        message={asAppMessage(answerMessage)}
                        canMarkAsAnswer={false}
                        highlight={false}
                        asCard
                      />
                    ) : null}
                    <h2 className="py-2 text-base">Replies</h2>
                  </Reveal>
                ) : null}

                {replies.map((slot) => (
                  <Reveal
                    key={slot.message.id}
                    visible={slot.visible}
                    layout={layout}
                  >
                    <ThreadReply
                      message={asAppMessage(slot.message)}
                      canMarkAsAnswer={false}
                      highlight={false}
                    />
                  </Reveal>
                ))}
              </div>
              <div className="sticky bottom-0 mx-auto w-full max-w-5xl px-8 pb-4">
                <MockThreadToolbar
                  mode={toolbarMode}
                  suggestions={suggestions}
                  replyDraft={replyDraft}
                  siDraft={siDraft}
                  siMessages={siMessages}
                  isResolved={thread.status === 2}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex w-64 flex-col gap-4 border-l bg-muted/25 p-4">
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
