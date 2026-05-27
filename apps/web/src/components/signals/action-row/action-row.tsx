// TODO(signals-overhaul issue 10): revisit when rewriting the feed against
// thread.agentRead. These primitives don't touch the dropped suggestion table,
// but they exist to render the old signal cards; the rewrite may replace them.

import { ActionButton } from "@workspace/ui/components/button";
import { PriorityIndicator } from "@workspace/ui/components/indicator";
import { X } from "lucide-react";
import { createContext, type ReactNode, use } from "react";

// Local urgency tier — the legacy `UrgencyTier` schema export is gone in the
// signals overhaul; issue 10 rewrites this surface against the new ThreadRead
// urgencyScore (0..100) directly.
export type UrgencyTier = "red" | "orange" | "yellow";

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
      <div className="bg-background-secondary flex flex-col overflow-clip rounded-md border">
        {children}
      </div>
    </ActionRowContext.Provider>
  );
}

function Header({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex flex-col gap-2 border-b px-3 py-3">
      {children}
    </div>
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
    <div className="flex items-center gap-2 pr-8 text-sm text-foreground-primary">
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
    <div className="flex items-center gap-1.5 text-foreground-primary text-sm">
      <span
        aria-hidden
        className="ml-[6px] -mt-2 h-3 w-2.5 shrink-0 rounded-bl-md border-b-2 border-l-2 border-foreground-tertiary/75"
      />
      {children}
    </div>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 px-3 py-2 bg-background-tertiary">
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
  Header,
  Tag,
  Title,
  Meta,
  Reason,
  Actions,
  Dismiss,
};

export function ActionRowSkeleton() {
  return (
    <div className="bg-background-secondary flex flex-col overflow-clip rounded-md border">
      <div className="flex flex-col gap-2 border-b px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="h-[11px] w-[14px] shrink-0 animate-pulse rounded bg-accent" />
          <div className="h-3 w-32 animate-pulse rounded bg-accent" />
        </div>
        <div className="h-3 w-48 animate-pulse rounded bg-accent" />
      </div>
      <div className="bg-background-tertiary flex justify-end px-3 py-2">
        <div className="h-6 w-20 animate-pulse rounded bg-accent" />
      </div>
    </div>
  );
}
