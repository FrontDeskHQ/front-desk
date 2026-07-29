/* mirror: thread labels — apps/web/src/components/threads/labels.tsx
 * fork: apps/web/src/components/threads/labels.tsx @ 59006b69
 *   why: live-state label queries + jotai org + mutate attach/detach
 * reuse: LabelBadge
 * state: Webhooks always; Churn risk after pushback phase
 * marketing: fade-up on newly added Churn risk chip (parent)
 */

import { LabelBadge } from "@workspace/ui/components/label-badge";
import { PlusIcon } from "lucide-react";

import type { MockLabel } from "./types";

interface MockLabelsProps {
  labels: MockLabel[];
}

export function MockLabels({ labels }: MockLabelsProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-foreground-secondary text-xs">Labels</div>
      <div className="flex flex-col gap-1.5">
        <div className="justify-start text-sm px-2 w-full py-1 max-w-none flex items-center gap-2 flex-wrap h-auto">
          {labels.map((label) => (
            <LabelBadge key={label.name} name={label.name} color={label.color} />
          ))}
          <div className="flex size-6 items-center justify-center">
            <PlusIcon className="size-4 text-foreground-secondary" />
          </div>
        </div>
      </div>
    </div>
  );
}
