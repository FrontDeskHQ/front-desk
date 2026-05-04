import type { UrgencyTier } from "@workspace/schemas/signals";
import { ActionButton } from "@workspace/ui/components/button";
import { PriorityIndicator } from "@workspace/ui/components/indicator";
import { X } from "lucide-react";
import { createContext, type ReactNode, use } from "react";

type ActionRowContextValue = {
  tier: UrgencyTier;
};

const ActionRowContext = createContext<ActionRowContextValue | null>(null);

function useActionRow(): ActionRowContextValue {
  const ctx = use(ActionRowContext);
  if (!ctx) {
    throw new Error("ActionRow.* used outside <ActionRow.Root>");
  }
  return ctx;
}

function Root({ tier, children }: { tier: UrgencyTier; children: ReactNode }) {
  return (
    <ActionRowContext.Provider value={{ tier }}>
      <div className="relative grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-4 py-3 text-sm">
        {children}
      </div>
    </ActionRowContext.Provider>
  );
}

const TIER_PRIORITY: Record<UrgencyTier, number> = {
  red: 3,
  orange: 2,
  yellow: 1,
};

function Tag() {
  const { tier } = useActionRow();
  return (
    <span role="img" aria-label={`urgency: ${tier}`} className="shrink-0">
      <PriorityIndicator priority={TIER_PRIORITY[tier]} />
    </span>
  );
}

function Title({ children }: { children: ReactNode }) {
  return (
    <div className="col-start-1 flex items-center gap-2 pr-8 text-foreground-primary text-sm font-medium">
      <Tag />
      {children}
    </div>
  );
}

function Meta({ children }: { children: ReactNode }) {
  return (
    <span className="text-foreground-secondary text-xs font-normal">
      {children}
    </span>
  );
}

function Reason({ children }: { children: ReactNode }) {
  return (
    <div className="col-start-1 flex items-center gap-1.5 text-foreground-secondary text-xs">
      <span
        aria-hidden
        className="ml-[6px] -mt-2 h-3 w-2.5 shrink-0 rounded-bl-md border-b-[1.5px] border-l-[1.5px] border-foreground-tertiary/75"
      />
      {children}
    </div>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return (
    <div className="col-start-2 row-start-2 flex items-end justify-end gap-2">
      {children}
    </div>
  );
}

function Dismiss({
  onClick,
  label = "Dismiss",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <div className="absolute top-2 right-2">
      <ActionButton size="sm" variant="ghost" tooltip={label} onClick={onClick}>
        <X className="size-3.5" />
      </ActionButton>
    </div>
  );
}

export const ActionRow = {
  Root,
  Tag,
  Title,
  Meta,
  Reason,
  Actions,
  Dismiss,
};

export function ActionRowSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="h-[11px] w-[14px] shrink-0 animate-pulse rounded bg-accent" />
        <div className="h-3 w-32 animate-pulse rounded bg-accent" />
      </div>
      <div className="h-3 w-48 animate-pulse rounded bg-accent" />
      <div className="h-7 w-16 animate-pulse rounded bg-accent" />
    </div>
  );
}
