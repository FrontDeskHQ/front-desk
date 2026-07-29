/* mirror: thread properties — apps/web/src/components/threads/properties.tsx
 * fork: apps/web/src/components/threads/properties.tsx @ 59006b69
 *   why: mutate.thread.* inside Combobox onValueChange
 * reuse: StatusIndicator, StatusText, PriorityIndicator, PriorityText, Avatar
 * state: status/priority/assignee from fixture; display-only rows
 * marketing: none
 */

import { Avatar } from "@workspace/ui/components/avatar";
import {
  PriorityIndicator,
  PriorityText,
  StatusIndicator,
  StatusText,
} from "@workspace/ui/components/indicator";
import { CircleUser } from "lucide-react";

interface MockPropertiesProps {
  status: number;
  priority: number;
  assignedUserName: string | null;
}

export function MockProperties({
  status,
  priority,
  assignedUserName,
}: MockPropertiesProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-muted-foreground text-xs">Properties</div>
      <div className="flex flex-col gap-1.5">
        <div className="text-sm px-1.5 max-w-40 py-1 w-full flex items-center gap-2">
          <div className="flex items-center justify-center size-4">
            <StatusIndicator status={status} />
          </div>
          <StatusText status={status} />
        </div>
        <div className="text-sm px-1.5 max-w-40 py-1 w-full flex items-center gap-2">
          <div className="flex items-center justify-center size-4">
            <PriorityIndicator priority={priority} />
          </div>
          <PriorityText priority={priority} />
        </div>
        <div className="text-sm px-1.5 max-w-40 py-1 w-full flex items-center gap-2">
          <div className="flex items-center justify-center size-4">
            {assignedUserName ? (
              <Avatar variant="user" size="md" fallback={assignedUserName} />
            ) : (
              <CircleUser className="size-4 text-foreground-secondary" />
            )}
          </div>
          {assignedUserName ?? "Unassigned"}
        </div>
      </div>
    </div>
  );
}
