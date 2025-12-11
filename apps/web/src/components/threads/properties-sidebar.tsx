import { useLiveQuery } from "@live-state/sync/client";
import { Button } from "@workspace/ui/components/button";
import {
  type BaseItem,
  Combobox,
  ComboboxContent,
  ComboboxCreatableItem,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  prepareCreatableItems,
} from "@workspace/ui/components/combobox";
import { LabelBadge } from "@workspace/ui/components/label-badge";
import { SidebarMenuButton } from "@workspace/ui/components/sidebar";
import { cn } from "@workspace/ui/lib/utils";
import { useAtomValue } from "jotai/react";
import { PlusIcon, TagIcon } from "lucide-react";
import { useState } from "react";
import { ulid } from "ulid";
import { activeOrganizationAtom } from "~/lib/atoms";
import { mutate, query } from "~/lib/live-state";

type LabelItem = BaseItem & {
  color: string;
};

export function LabelsSection({ threadId }: { threadId: string }) {
  const currentOrg = useAtomValue(activeOrganizationAtom);

  const [search, setSearch] = useState("");

  const allLabels = useLiveQuery(
    query.label.where({
      organizationId: currentOrg?.id,
    }),
  );

  const threadLabels = useLiveQuery(
    query.threadLabel
      .where({
        threadId: threadId,
      })
      .include({
        label: true,
      }),
  );

  const items =
    allLabels?.map(
      (label): LabelItem => ({
        value: label.id,
        label: label.name,
        color: label.color,
      }),
    ) ?? [];

  const itemsForView = prepareCreatableItems(items, search, true);

  const activeLabels = threadLabels?.filter((tl) => tl.enabled);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-foreground-secondary text-xs">Labels</div>
      <div className="flex flex-col gap-1.5">
        <Combobox
          multiple
          items={itemsForView}
          value={
            threadLabels
              ?.filter((tl) => tl.enabled)
              .map((label) => label.label.id) ?? []
          }
          onValueChange={async (next) => {
            const creatableSelection = next.find((item) =>
              item.startsWith("create:"),
            );

            if (creatableSelection) {
              const newItem = creatableSelection.replace("create:", "");
              if (!currentOrg?.id) return;

              const newLabelId = ulid().toLowerCase();

              mutate.label.insert({
                id: newLabelId,
                name: newItem,
                color: "oklch(0.5 0 0)",
                createdAt: new Date(),
                updatedAt: new Date(),
                organizationId: currentOrg?.id,
              });

              // TODO remove this once we have a proper transaction system
              setTimeout(() => {
                mutate.threadLabel.insert({
                  id: ulid().toLowerCase(),
                  threadId: threadId,
                  labelId: newLabelId,
                  enabled: true,
                });
              }, 100);
            } else {
              const nextLabelSet = new Set(
                next.filter((i) => !i.startsWith("create:")),
              );

              const currentLabelSet = new Set(
                threadLabels
                  ?.filter((tl) => tl.enabled)
                  .map((tl) => tl.label.id) ?? [],
              );

              // Create a map of labelId -> threadLabel for quick lookup
              const threadLabelMap = new Map(
                threadLabels?.map((tl) => [tl.label.id, tl]) ?? [],
              );

              // Labels to add (in next but not in current)
              const labelsToAdd = Array.from(nextLabelSet).filter(
                (labelId) => !currentLabelSet.has(labelId),
              );

              // Labels to remove (in current but not in next)
              const labelsToRemove = Array.from(currentLabelSet).filter(
                (labelId) => !nextLabelSet.has(labelId),
              );

              // Add labels
              for (const labelId of labelsToAdd) {
                const existingThreadLabel = threadLabelMap.get(labelId);

                if (existingThreadLabel) {
                  // Update existing connection
                  mutate.threadLabel.update(existingThreadLabel.id, {
                    enabled: true,
                  });
                } else {
                  // Insert new connection
                  mutate.threadLabel.insert({
                    id: ulid().toLowerCase(),
                    threadId: threadId,
                    labelId: labelId,
                    enabled: true,
                  });
                }
              }

              // Remove labels (set enabled to false)
              for (const labelId of labelsToRemove) {
                const existingThreadLabel = threadLabelMap.get(labelId);

                if (existingThreadLabel) {
                  mutate.threadLabel.update(existingThreadLabel.id, {
                    enabled: false,
                  });
                }
              }
            }
            setSearch("");
          }}
          inputValue={search}
          onInputValueChange={setSearch}
        >
          <ComboboxTrigger
            variant="unstyled"
            render={
              <SidebarMenuButton
                size="sm"
                className={cn(
                  "text-sm px-0 w-full py-1 max-w-40",
                  activeLabels?.length &&
                    "hover:bg-transparent active:bg-transparent h-auto max-w-none",
                )}
              >
                {threadLabels?.filter((tl) => tl.enabled).length > 0 ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    {activeLabels?.map((label) => (
                      <LabelBadge
                        key={label.label.id}
                        name={label.label.name}
                        color={label.label.color}
                      />
                    ))}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-6"
                      asChild
                    >
                      <div>
                        <PlusIcon className="size-4 text-foreground-secondary" />
                      </div>
                    </Button>
                  </div>
                ) : (
                  <>
                    <TagIcon className="size-4 text-foreground-secondary" />
                    <span className="text-foreground-secondary">
                      Add labels
                    </span>
                  </>
                )}
              </SidebarMenuButton>
            }
          />

          <ComboboxContent className="w-48" side="left">
            <ComboboxInput placeholder="Search or create..." />
            <ComboboxEmpty />
            <ComboboxList>
              {(item: LabelItem) =>
                item.creatable ? (
                  <ComboboxCreatableItem key={item.value} value={item.value}>
                    {item.label}
                  </ComboboxCreatableItem>
                ) : (
                  <ComboboxItem key={item.value} value={item.value}>
                    <div
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <div className="truncate grow shrink">{item.label}</div>
                  </ComboboxItem>
                )
              }
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
    </div>
  );
}
