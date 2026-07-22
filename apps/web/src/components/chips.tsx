"use client";

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
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import {
  ArrowRight,
  CircleCheck,
  CircleDot,
  CircleUser,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
} from "lucide-react";

import {
  getPullRequestState,
  useMirrorEntityByRef,
} from "~/components/threads/external-entities";
import type {
  MirrorEntity,
  PullRequestState,
} from "~/components/threads/external-entities";

const threadChipVariants = cva(
  "flex items-center w-fit gap-1.5 cursor-default text-xs border h-6 rounded-sm px-2 has-[>svg:first-child]:pl-1.5 has-[>svg:last-child]:pr-1.5 bg-foreground-tertiary/15 hover:bg-foreground-tertiary/25 transition-colors",
  {
    defaultVariants: {
      disabled: false,
    },
    variants: {
      disabled: {
        false: "",
        true: "opacity-50 pointer-events-none",
      },
    },
  }
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
      {thread.shortId !== null && (
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
          {thread.shortId !== null && (
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

const pullRequestStateConfig: Record<
  PullRequestState,
  { label: string; icon: typeof GitPullRequest; className: string }
> = {
  closed: {
    className: "text-red-600 dark:text-red-500",
    icon: GitPullRequestClosed,
    label: "Closed",
  },
  draft: {
    className: "text-foreground-secondary",
    icon: GitPullRequestDraft,
    label: "Draft",
  },
  merged: {
    className: "text-purple-600 dark:text-purple-500",
    icon: GitMerge,
    label: "Merged",
  },
  open: {
    className: "text-green-600 dark:text-green-500",
    icon: GitPullRequest,
    label: "Open",
  },
};

function PrStateIndicator({ state }: { state: PullRequestState }) {
  const { label, icon: Icon, className } = pullRequestStateConfig[state];
  return (
    <Icon className={cn("size-3.5 shrink-0", className)} aria-label={label} />
  );
}

function ExternalEntitySummaryHeader({
  stateIndicator,
  entity,
  stateLabel,
  subtitle,
}: {
  stateIndicator: React.ReactNode;
  entity: Pick<MirrorEntity, "title" | "number">;
  stateLabel: string;
  subtitle?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {stateIndicator}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="font-medium text-sm text-foreground-primary truncate">
            {entity.title}
          </span>
          <span className="text-sm text-foreground-secondary tabular-nums shrink-0">
            #{entity.number}
          </span>
        </div>
        <span className="text-sm text-foreground-secondary shrink-0">
          {stateLabel}
        </span>
      </div>
      {subtitle}
    </div>
  );
}

function ExternalEntityMetadataGrid({
  entity,
}: {
  entity: Pick<MirrorEntity, "repoFullName" | "authorLogin">;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="text-xs text-muted-foreground">Repository</div>
        <span className="text-sm truncate">{entity.repoFullName}</span>
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        <div className="text-xs text-muted-foreground">Author</div>
        <span className="text-sm truncate">
          {entity.authorLogin ?? "Unknown"}
        </span>
      </div>
    </div>
  );
}

function ExternalEntityLabelList({ labels }: { labels: string[] }) {
  if (labels.length === 0) {
    return null;
  }

  return (
    <>
      <Separator />
      <div className="flex flex-wrap gap-1">
        {labels.map((labelName) => (
          <span
            key={labelName}
            className="rounded-sm bg-foreground-tertiary/15 px-1.5 py-0.5 text-xs text-foreground-secondary"
          >
            {labelName}
          </span>
        ))}
      </div>
    </>
  );
}

function ExternalEntitySummaryCard({
  stateIndicator,
  entity,
  stateLabel,
  subtitle,
}: {
  stateIndicator: React.ReactNode;
  entity: MirrorEntity;
  stateLabel: string;
  subtitle?: React.ReactNode;
}) {
  return (
    <>
      <ExternalEntitySummaryHeader
        stateIndicator={stateIndicator}
        entity={entity}
        stateLabel={stateLabel}
        subtitle={subtitle}
      />
      <Separator />
      <ExternalEntityMetadataGrid entity={entity} />
      <ExternalEntityLabelList labels={entity.labels} />
    </>
  );
}

function ExternalEntitySummaryHoverCard({
  children,
  summary,
  ...props
}: Omit<React.ComponentProps<typeof HoverCard>, "children"> & {
  summary: React.ReactNode;
  children: React.ReactElement;
}) {
  return (
    <HoverCard {...props}>
      <HoverCardTrigger render={children} />
      <HoverCardContent className="max-w-96 w-full flex flex-col gap-3">
        {summary}
      </HoverCardContent>
    </HoverCard>
  );
}

function PrBranchSubtitle({ entity }: { entity: MirrorEntity }) {
  if (!entity.headRef && !entity.baseRef) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground font-mono">
      {entity.headRef ? (
        <span className="truncate">{entity.headRef}</span>
      ) : null}
      {entity.headRef && entity.baseRef ? (
        <ArrowRight
          className="size-3.5 shrink-0 text-foreground-secondary"
          aria-hidden="true"
        />
      ) : null}
      {entity.baseRef ? (
        <span className="truncate">{entity.baseRef}</span>
      ) : null}
    </div>
  );
}

function PrSummaryCard({ entity }: { entity: MirrorEntity }) {
  const prState = getPullRequestState(entity);
  const { label } = pullRequestStateConfig[prState];

  return (
    <ExternalEntitySummaryCard
      stateIndicator={<PrStateIndicator state={prState} />}
      entity={entity}
      stateLabel={label}
      subtitle={<PrBranchSubtitle entity={entity} />}
    />
  );
}

type PrChipButtonProps = Omit<
  React.ComponentProps<typeof BaseButton>,
  "children" | "render"
> &
  VariantProps<typeof threadChipVariants> & {
    url: string;
    ariaLabel: string;
    children: React.ReactNode;
  };

function PrChipButton({
  url,
  ariaLabel,
  disabled = false,
  className,
  children,
  ...props
}: PrChipButtonProps) {
  return (
    <BaseButton
      type="button"
      className={cn(threadChipVariants({ disabled }), className)}
      disabled={disabled ?? false}
      render={
        // biome-ignore lint/a11y/useAnchorContent: Content is provided via children
        <a href={url} target="_blank" rel="noreferrer" aria-label={ariaLabel} />
      }
      {...props}
    >
      {children}
    </BaseButton>
  );
}

type IssueState = "open" | "closed";

const issueStateConfig: Record<
  IssueState,
  { label: string; icon: typeof CircleDot; className: string }
> = {
  closed: {
    className: "text-purple-600 dark:text-purple-500",
    icon: CircleCheck,
    label: "Closed",
  },
  open: {
    className: "text-green-600 dark:text-green-500",
    icon: CircleDot,
    label: "Open",
  },
};

const getIssueState = (entity: Pick<MirrorEntity, "state">): IssueState =>
  entity.state === "closed" ? "closed" : "open";

function IssueStateIndicator({ state }: { state: IssueState }) {
  const { label, icon: Icon, className } = issueStateConfig[state];
  return (
    <Icon className={cn("size-3.5 shrink-0", className)} aria-label={label} />
  );
}

function IssueSummaryCard({ entity }: { entity: MirrorEntity }) {
  const issueState = getIssueState(entity);
  const { label } = issueStateConfig[issueState];

  return (
    <ExternalEntitySummaryCard
      stateIndicator={<IssueStateIndicator state={issueState} />}
      entity={entity}
      stateLabel={label}
    />
  );
}

export function IssueChip({
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
  const entity = useMirrorEntityByRef({
    number,
    repoFullName: `${owner}/${repo}`,
    type: "issue",
  });

  if (entity) {
    const issueState = getIssueState(entity);
    const { label } = issueStateConfig[issueState];

    const chip = (
      <PrChipButton
        url={entity.url}
        ariaLabel={`Issue ${entity.repoFullName}#${entity.number}: ${entity.title} (${label}, opens in new tab)`}
        disabled={disabled}
        className={className}
        {...props}
      >
        <IssueStateIndicator state={issueState} />
        <span className="text-foreground-primary truncate max-w-48">
          {entity.title}
        </span>
        <span className="text-foreground-secondary tabular-nums shrink-0">
          #{entity.number}
        </span>
      </PrChipButton>
    );

    return (
      <ExternalEntitySummaryHoverCard
        summary={<IssueSummaryCard entity={entity} />}
      >
        {chip}
      </ExternalEntitySummaryHoverCard>
    );
  }

  return (
    <PrChipButton
      url={url}
      ariaLabel={`Issue ${owner}/${repo}#${number} (opens in new tab)`}
      disabled={disabled}
      className={className}
      {...props}
    >
      <CircleDot className="size-3.5 text-foreground-secondary shrink-0" />
      <span className="text-foreground-primary">
        {owner}/{repo}
      </span>
      <span className="text-foreground-secondary tabular-nums">#{number}</span>
    </PrChipButton>
  );
}

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
  const entity = useMirrorEntityByRef({
    number,
    repoFullName: `${owner}/${repo}`,
    type: "pull_request",
  });

  if (entity) {
    const prState = getPullRequestState(entity);
    const { label } = pullRequestStateConfig[prState];

    const chip = (
      <PrChipButton
        url={entity.url}
        ariaLabel={`Pull request ${entity.repoFullName}#${entity.number}: ${entity.title} (${label}, opens in new tab)`}
        disabled={disabled}
        className={className}
        {...props}
      >
        <PrStateIndicator state={prState} />
        <span className="text-foreground-primary truncate max-w-48">
          {entity.title}
        </span>
        <span className="text-foreground-secondary tabular-nums shrink-0">
          #{entity.number}
        </span>
      </PrChipButton>
    );

    return (
      <ExternalEntitySummaryHoverCard
        summary={<PrSummaryCard entity={entity} />}
      >
        {chip}
      </ExternalEntitySummaryHoverCard>
    );
  }

  return (
    <PrChipButton
      url={url}
      ariaLabel={`Pull request ${owner}/${repo}#${number} (opens in new tab)`}
      disabled={disabled}
      className={className}
      {...props}
    >
      <GitPullRequest className="size-3.5 text-foreground-secondary shrink-0" />
      <span className="text-foreground-primary">
        {owner}/{repo}
      </span>
      <span className="text-foreground-secondary tabular-nums">#{number}</span>
    </PrChipButton>
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
