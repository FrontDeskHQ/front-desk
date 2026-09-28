import { cn } from "@workspace/ui/lib/utils";
import { CircleCheck, CircleDot } from "lucide-react";

import type { MirrorEntity } from "./external-entities";

export type IssueState = "open" | "closed";

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

export const getIssueState = (entity: Pick<MirrorEntity, "state">): IssueState =>
  entity.state === "closed" ? "closed" : "open";

export const getIssueStateLabel = (state: IssueState): string =>
  issueStateConfig[state].label;

export function IssueStateIndicator({
  state,
  className,
}: {
  state: IssueState;
  className?: string;
}) {
  const { label, icon: Icon, className: stateClassName } =
    issueStateConfig[state];

  return (
    <Icon
      className={cn("size-3.5 shrink-0", stateClassName, className)}
      aria-label={label}
    />
  );
}
