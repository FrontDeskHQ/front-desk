/* mirror: quick actions panel — apps/web/src/components/threads/thread-toolbar/quick-actions.tsx
 * fork: apps/web/src/components/threads/thread-toolbar/quick-actions.tsx @ 59006b69
 *   why: live-state suggestion hooks, mutate accept/dismiss, hover-card handle, analytics
 * reuse: StatusIndicator, ActionButton
 * state: status + label suggestions from fixture props; expanded, no duplicate row
 * marketing: none — collapse/close chrome rendered static (showClose)
 */

import { ActionButton } from "@workspace/ui/components/button";
import { StatusIndicator } from "@workspace/ui/components/indicator";
import { Check, ChevronDown, X, Zap } from "lucide-react";

import type { MockLabel, MockStatusSuggestion } from "./types";

interface MockQuickActionsPanelProps {
  suggestedLabels: MockLabel[];
  statusSuggestion: MockStatusSuggestion | null;
  showClose?: boolean;
}

export function MockQuickActionsPanel({
  suggestedLabels,
  statusSuggestion,
  showClose = false,
}: MockQuickActionsPanelProps) {
  const hasStatusOrLabelSuggestions =
    suggestedLabels.length > 0 || statusSuggestion !== null;

  if (!hasStatusOrLabelSuggestions) {
    return null;
  }

  return (
    <div data-slot="quick-actions-panel" className="px-4 py-4">
      <div className="flex gap-4 items-center">
        <Zap className="size-3.5 stroke-2" />
        <div className="flex-1">Support Intelligence</div>
        <div className="flex items-center gap-0">
          <ActionButton
            variant="ghost"
            size="icon-sm"
            tooltip="Collapse"
            className="text-foreground-secondary"
            tabIndex={-1}
          >
            <ChevronDown className="text-foreground-secondary pointer-events-none size-4 shrink-0 rotate-180" />
          </ActionButton>
          {showClose ? (
            <ActionButton
              variant="ghost"
              size="icon-sm"
              tooltip="Close"
              className="text-foreground-secondary"
              tabIndex={-1}
            >
              <X className="size-4" />
            </ActionButton>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden text-sm">
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mt-2 items-center">
          <div className="text-foreground-secondary">Suggestions</div>
          <div className="flex gap-2 items-center flex-wrap group">
            {statusSuggestion ? (
              <ActionButton
                variant="ghost"
                size="sm"
                className="border border-dashed border-input dark:hover:bg-foreground-tertiary/15"
                tabIndex={-1}
              >
                <StatusIndicator status={statusSuggestion.status} />
                {statusSuggestion.label}
              </ActionButton>
            ) : null}
            {suggestedLabels.map((label) => (
              <ActionButton
                key={label.name}
                variant="ghost"
                size="sm"
                className="border border-dashed border-input dark:hover:bg-foreground-tertiary/15"
                tabIndex={-1}
              >
                <div
                  className="size-2 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
                {label.name}
              </ActionButton>
            ))}

            <div className="flex items-center gap-0 opacity-0 transition-opacity pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto">
              <ActionButton
                variant="ghost"
                size="icon-sm"
                tooltip="Accept all"
                className="text-foreground-secondary"
                tabIndex={-1}
              >
                <Check />
              </ActionButton>
              <ActionButton
                variant="ghost"
                size="icon-sm"
                tooltip="Ignore all"
                className="text-foreground-secondary"
                tabIndex={-1}
              >
                <X />
              </ActionButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
