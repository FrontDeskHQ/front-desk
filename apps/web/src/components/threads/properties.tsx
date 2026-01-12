import type { InferLiveObject } from "@live-state/sync";
import { Avatar } from "@workspace/ui/components/avatar";
import { ActionButton } from "@workspace/ui/components/button";
import {
  type BaseItem,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@workspace/ui/components/combobox";
import {
  PriorityIndicator,
  PriorityText,
  StatusIndicator,
  StatusText,
  statusValues,
} from "@workspace/ui/components/indicator";
import { cn } from "@workspace/ui/lib/utils";
import type { schema } from "api/schema";
import { CircleUser } from "lucide-react";
import { ulid } from "ulid";
import { assignThreadToUser } from "~/actions/threads";
import { mutate } from "~/lib/live-state";

interface PropertiesSectionProps {
  thread: InferLiveObject<
    typeof schema.thread,
    { assignedUser: { user: true } }
  >;
  id: string;
  user: InferLiveObject<typeof schema.user>;
  organizationUsers: InferLiveObject<
    typeof schema.organizationUser,
    { user: true }
  >[];
  captureThreadEvent: (
    eventName: string,
    properties?: Record<string, unknown>,
  ) => void;
}

export function PropertiesSection({
  thread,
  id,
  user,
  organizationUsers,
  captureThreadEvent,
}: PropertiesSectionProps) {
  return (
    <>
      <div className="text-muted-foreground text-xs">Properties</div>
      <div className="flex flex-col gap-1.5">
        <Combobox
          items={Object.entries(statusValues).map(([key, value]) => ({
            value: key,
            label: value.label,
          }))}
          value={thread?.status ?? 0}
          onValueChange={(value) => {
            const oldStatus = thread?.status ?? 0;
            const newStatus = value ? +value : 0;
            const oldStatusLabel = statusValues[oldStatus]?.label ?? "Unknown";
            const newStatusLabel = statusValues[newStatus]?.label ?? "Unknown";

            mutate.thread.update(id, {
              status: newStatus,
            });

            mutate.update.insert({
              id: ulid().toLowerCase(),
              threadId: id,
              type: "status_changed",
              createdAt: new Date(),
              userId: user.id,
              metadataStr: JSON.stringify({
                oldStatus,
                newStatus,
                oldStatusLabel,
                newStatusLabel,
                userName: user.name,
              }),
              replicatedStr: JSON.stringify({}),
            });

            captureThreadEvent("thread:status_update", {
              old_status: oldStatus,
              old_status_label: oldStatusLabel,
              new_status: newStatus,
              new_status_label: newStatusLabel,
            });
          }}
        >
          <ComboboxTrigger
            variant="unstyled"
            render={
              <ActionButton
                variant="ghost"
                size="sm"
                className="text-sm px-1.5 max-w-40 py-1 w-full justify-start"
                tooltip="Change status"
                keybind="s"
              >
                <div className="flex items-center justify-center size-4">
                  <StatusIndicator status={thread?.status ?? 0} />
                </div>
                <StatusText status={thread?.status ?? 0} />
              </ActionButton>
            }
          />
          <ComboboxContent className="w-48">
            <ComboboxInput placeholder="Search..." />
            <ComboboxEmpty />
            <ComboboxList>
              {(item: BaseItem) => (
                <ComboboxItem key={item.value} value={item.value}>
                  <StatusIndicator status={+item.value} />
                  {item.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <Combobox
          items={[
            {
              value: 0,
              label: "No priority",
            },
            {
              value: 1,
              label: "Low priority",
            },
            {
              value: 2,
              label: "Medium priority",
            },
            {
              value: 3,
              label: "High priority",
            },
          ]}
          value={thread?.priority}
          onValueChange={(value) => {
            const oldPriority = thread?.priority ?? 0;
            const newPriority = value ? +value : 0;
            const priorityLabels: Record<number, string> = {
              0: "No priority",
              1: "Low priority",
              2: "Medium priority",
              3: "High priority",
            };
            const oldPriorityLabel = priorityLabels[oldPriority] ?? "Unknown";
            const newPriorityLabel = priorityLabels[newPriority] ?? "Unknown";

            mutate.thread.update(id, {
              priority: newPriority,
            });

            mutate.update.insert({
              id: ulid().toLowerCase(),
              threadId: id,
              type: "priority_changed",
              createdAt: new Date(),
              userId: user.id,
              metadataStr: JSON.stringify({
                oldPriority,
                newPriority,
                oldPriorityLabel,
                newPriorityLabel,
                userName: user.name,
              }),
              replicatedStr: JSON.stringify({}),
            });

            captureThreadEvent("thread:priority_update", {
              old_priority: oldPriority,
              old_priority_label: oldPriorityLabel,
              new_priority: newPriority,
              new_priority_label: newPriorityLabel,
            });
          }}
        >
          <ComboboxTrigger
            variant="unstyled"
            render={
              <ActionButton
                variant="ghost"
                size="sm"
                className="text-sm px-1.5 max-w-40 py-1 w-full justify-start"
                tooltip="Change priority"
                keybind="p"
              >
                <div className="flex items-center justify-center size-4">
                  <PriorityIndicator priority={thread?.priority ?? 0} />
                </div>
                <PriorityText priority={thread?.priority ?? 0} />
              </ActionButton>
            }
          />

          <ComboboxContent className="w-48">
            <ComboboxInput placeholder="Search..." />
            <ComboboxEmpty />
            <ComboboxList>
              {(item: BaseItem) => (
                <ComboboxItem key={item.value} value={item.value}>
                  <PriorityIndicator priority={+item.value} />
                  {item.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <Combobox
          items={[
            {
              value: null,
              label: "Unassigned",
            },
            ...(organizationUsers?.map((user) => ({
              value: user.userId,
              label: user.user.name,
            })) ?? []),
          ]}
          value={thread?.assignedUser?.id}
          onValueChange={async (value) => {
            await assignThreadToUser({
              threadId: id,
              newAssignedUser: {
                id: value,
                name:
                  organizationUsers?.find((ou) => ou.userId === value)?.user
                    .name ?? null,
              },
              oldAssignedUser: {
                id: thread?.assignedUser?.id ?? null,
                name: thread?.assignedUser?.name ?? null,
              },
              userId: user.id,
            });

            captureThreadEvent("thread:assignee_update", {
              old_assigned_user_id: oldAssignedUserId,
              old_assigned_user_name: oldAssignedUserName,
              new_assigned_user_id: newAssignedUserId,
              new_assigned_user_name: newAssignedUserName,
              action: newAssignedUserId ? "assigned" : "unassigned",
            });
          }}
        >
          <ComboboxTrigger
            variant="unstyled"
            render={
              <ActionButton
                variant="ghost"
                size="sm"
                className={cn(
                  "text-sm px-1.5 max-w-40 py-1 w-full justify-start text-muted-foreground",
                  thread?.assignedUser?.name && "text-primary",
                )}
                tooltip="Assign to"
                keybind="a"
              >
                <div className="flex items-center justify-center size-4">
                  {thread?.assignedUser ? (
                    <Avatar
                      variant="user"
                      size="md"
                      fallback={thread?.assignedUser.name}
                    />
                  ) : (
                    <CircleUser className="size-4" />
                  )}
                </div>
                {thread?.assignedUser?.name ?? "Unassigned"}
              </ActionButton>
            }
          />

          <ComboboxContent className="w-48">
            <ComboboxInput placeholder="Search..." />
            <ComboboxEmpty />
            <ComboboxList>
              {(item: BaseItem) => (
                <ComboboxItem key={item.value} value={item.value}>
                  {item.value ? (
                    <Avatar variant="user" size="md" fallback={item.label} />
                  ) : (
                    <CircleUser className="mx-0.5" />
                  )}
                  {item.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
    </>
  );
}
