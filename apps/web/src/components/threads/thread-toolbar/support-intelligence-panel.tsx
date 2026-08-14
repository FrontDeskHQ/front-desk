import type { ThreadRead } from "@workspace/schemas/signals";
import { SparklesIcon } from "lucide-react";

import type {
  ActorContext,
  ThreadWithRelations,
} from "~/components/signals/action-row";
import { ThreadReadCard } from "~/components/signals/action-row";

import type { QuickActionsSuggestionsData } from "./quick-actions";
import { QuickActionsPanel } from "./quick-actions";

interface SupportIntelligencePanelProps {
  thread: ThreadWithRelations | undefined;
  ctx: ActorContext | null;
  hasLabelSuggestions: boolean;
  suggestionsData: QuickActionsSuggestionsData;
  threadId: string;
  organizationId: string | undefined;
  threadLabels: { id: string; label: { id: string } }[] | undefined;
  currentStatus: number;
  user: { id: string; name: string };
  onClose: () => void;
  captureThreadEvent: (
    eventName: string,
    properties?: Record<string, unknown>
  ) => void;
}

function SupportIntelligenceEmpty() {
  return (
    <div
      data-slot="support-intelligence-empty"
      className="flex flex-col items-center gap-2 px-4 py-8 text-center"
    >
      <SparklesIcon className="size-4 text-foreground-secondary" />
      <p className="text-sm text-foreground-secondary">
        The Agent has nothing to propose on this thread.
      </p>
    </div>
  );
}

export function SupportIntelligencePanel({
  thread,
  ctx,
  hasLabelSuggestions,
  suggestionsData,
  threadId,
  organizationId,
  threadLabels,
  currentStatus,
  user,
  onClose,
  captureThreadEvent,
}: SupportIntelligencePanelProps) {
  if (thread?.agentRead && ctx) {
    return (
      <ThreadReadCard
        variant="thread"
        thread={
          thread as ThreadWithRelations & {
            agentRead: ThreadRead;
          }
        }
        ctx={ctx}
        onClose={onClose}
      />
    );
  }

  if (hasLabelSuggestions) {
    return (
      <QuickActionsPanel
        threadId={threadId}
        organizationId={organizationId}
        threadLabels={threadLabels}
        currentStatus={currentStatus}
        user={user}
        captureThreadEvent={captureThreadEvent}
        suggestionsData={suggestionsData}
      />
    );
  }

  return <SupportIntelligenceEmpty />;
}
