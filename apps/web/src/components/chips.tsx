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
import { cva, type VariantProps } from "class-variance-authority";
import { CircleUser, GitPullRequest } from "lucide-react";

const threadChipVariants = cva(
  "flex items-center w-fit gap-1.5 cursor-default text-xs border h-6 rounded-sm px-2 has-[>svg:first-child]:pl-1.5 has-[>svg:last-child]:pr-1.5 bg-foreground-tertiary/15 hover:bg-foreground-tertiary/25 transition-colors",
  {
    variants: {
      disabled: {
        true: "opacity-50 pointer-events-none",
        false: "",
      },
    },
    defaultVariants: {
      disabled: false,
    },
  },
);

type ThreadChipThread = InferLiveObject<
  typeof schema.thread,
  { author: { include: { user: true } } }
>;

type ThreadSummaryThread = InferLiveObject<
  typeof schema.thread,
  {
    author: { include: { user: true } };
    assignedUser: { include: { user: true } };
  }
>;

export function ThreadChip({
  thread,
  disabled = false,
  className,
  ...props
}: Omit<React.ComponentProps<typeof BaseButton>, "children"> &
  VariantProps<typeof threadChipVariants> & {
    thread: ThreadChipThread;
  }) {
  return (
    <BaseButton
      type="button"
      className={cn(threadChipVariants({ disabled }), className)}
      disabled={disabled ?? false}
      {...props}
    >
      <Avatar
        variant="user"
        size="sm"
        fallback={thread.author?.name}
        src={thread.author?.user?.image ?? undefined}
      />
      <span className="text-foreground-primary">{thread.name}</span>
      {thread.shortId != null && (
        <span className="text-foreground-secondary tabular-nums">
          #{thread.shortId}
        </span>
      )}
    </BaseButton>
  );
}

export function ThreadSummaryCard({ thread }: { thread: ThreadSummaryThread }) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="font-medium text-sm flex items-center gap-1.5">
          <span className="text-foreground-primary">{thread.name}</span>
          {thread.shortId != null && (
            <span className="text-foreground-secondary tabular-nums font-normal">
              #{thread.shortId}
            </span>
          )}
        </div>
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
                  size="md"
                  fallback={thread.author?.name}
                  src={thread.author?.user?.image ?? undefined}
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
    </>
  );
}

export function ThreadSummaryHoverCard({
  thread,
  children,
  ...props
}: Omit<React.ComponentProps<typeof HoverCard>, "children"> & {
  thread: ThreadSummaryThread;
  children: React.ReactElement;
}) {
  return (
    <HoverCard {...props}>
      <HoverCardTrigger render={children} />
      <HoverCardContent className="max-w-96 w-full flex flex-col gap-3">
        <ThreadSummaryCard thread={thread} />
      </HoverCardContent>
    </HoverCard>
  );
}

// TODO: surface live PR data (title + state) in a hover card by reading the
// org-scoped `externalEntity` mirror via useLiveQuery, mirroring
// ThreadChipWithSummary.
export function PrChip({
  owner,
  repo,
  number,
  url,
  disabled = false,
  className,
  ...props
}: Omit<React.ComponentProps<typeof BaseButton>, "children" | "render"> &
  VariantProps<typeof threadChipVariants> & {
    owner: string;
    repo: string;
    number: number;
    url: string;
  }) {
  return (
    <BaseButton
      type="button"
      className={cn(threadChipVariants({ disabled }), className)}
      disabled={disabled ?? false}
      render={
        // biome-ignore lint/a11y/useAnchorContent: Content is provided via children
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Pull request ${owner}/${repo}#${number} (opens in new tab)`}
        />
      }
      {...props}
    >
      <GitPullRequest className="size-3.5 text-foreground-secondary shrink-0" />
      <span className="text-foreground-primary">
        {owner}/{repo}
      </span>
      <span className="text-foreground-secondary tabular-nums">#{number}</span>
    </BaseButton>
  );
}

export function ThreadChipWithSummary({
  thread,
  ...props
}: Omit<React.ComponentProps<typeof ThreadChip>, "thread"> & {
  thread: ThreadSummaryThread;
}) {
  return (
    <ThreadSummaryHoverCard thread={thread}>
      <ThreadChip thread={thread} {...props} />
    </ThreadSummaryHoverCard>
  );
}
