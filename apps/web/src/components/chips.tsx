import { Button as BaseButton } from "@base-ui/react";
import type { InferLiveObject } from "@live-state/sync";
import { Avatar } from "@workspace/ui/components/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card";
import {
  PriorityIndicator,
  PriorityText,
  StatusIndicator,
  StatusText,
} from "@workspace/ui/components/indicator";
import { Separator } from "@workspace/ui/components/separator";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";
import type { schema } from "api/schema";
import { CircleUser } from "lucide-react";

export function BaseThreadChip({
  thread,
  disabled,
  className,
  ...props
}: Omit<React.ComponentProps<typeof BaseButton>, "children"> & {
  thread: InferLiveObject<
    typeof schema.thread,
    { author: { user: true }; assignedUser?: true }
  >;
  disabled?: boolean;
}) {
  return (
    <BaseButton
      type="button"
      className={cn(
        "border flex items-center w-fit h-6 rounded-sm gap-1.5 px-2 has-[>svg:first-child]:pl-1.5 has-[>svg:last-child]:pr-1.5 text-xs bg-foreground-tertiary/15 hover:bg-foreground-tertiary/25 transition-colors cursor-default",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
      disabled={disabled}
      {...props}
    >
      <Avatar
        variant="user"
        size="sm"
        fallback={thread.author?.name}
        src={thread.author?.user?.image ?? undefined}
      />
      {thread.name}
    </BaseButton>
  );
}

export function ThreadChip({
  thread,
  disabled,
  className,
  ...props
}: Omit<React.ComponentProps<typeof BaseButton>, "children"> & {
  thread: InferLiveObject<
    typeof schema.thread,
    { author: { user: true }; assignedUser: { user: true } }
  >;
  disabled?: boolean;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <BaseThreadChip
            thread={thread}
            disabled={disabled}
            className={className}
            {...props}
          />
        }
      />
      <HoverCardContent className="max-w-96 w-full flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="font-medium text-sm">{thread.name}</div>
          <div className="flex items-center gap-2">
            <Avatar
              variant="user"
              size="sm"
              fallback={thread.author?.name}
              src={thread.author?.user?.image ?? undefined}
            />
            <span className="text-sm">{thread.author?.name}</span>
            <div className="ml-2 text-xs text-muted-foreground">
              {thread.createdAt
                ? formatRelativeTime(thread.createdAt as Date)
                : "Unknown date"}
            </div>
          </div>
        </div>
        <Separator />
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="flex items-center gap-2">
              <StatusIndicator status={thread.status ?? 0} />
              <span className="text-sm">
                <StatusText status={thread.status ?? 0} />
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-xs text-muted-foreground">Priority</div>
            <div className="flex items-center gap-2">
              <PriorityIndicator priority={thread.priority ?? 0} />
              <span className="text-sm">
                <PriorityText priority={thread.priority ?? 0} />
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-xs text-muted-foreground">Assignee</div>
            <div className="flex items-center gap-2">
              {thread.assignedUserId && thread.assignedUser?.name ? (
                <>
                  <Avatar
                    variant="user"
                    size="sm"
                    fallback={thread.assignedUser?.name}
                    src={thread.assignedUser?.image ?? undefined}
                  />
                  <span className="text-sm">{thread.assignedUser?.name}</span>
                </>
              ) : (
                <>
                  <CircleUser className="size-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Unassigned
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
