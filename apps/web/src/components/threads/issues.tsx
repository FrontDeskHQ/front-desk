import { useLiveQuery } from "@live-state/sync/client";
import { useQuery } from "@tanstack/react-query";
import { ActionButton } from "@workspace/ui/components/button";
// import { useState } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxCreatableItem,
  ComboboxEmpty,
  ComboboxFooter,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@workspace/ui/components/combobox";
import { cn } from "@workspace/ui/lib/utils";
import { useAtomValue } from "jotai/react";
import { Github, Plus } from "lucide-react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient, query } from "~/lib/live-state";

export function IssuesSection({ threadId }: { threadId: string }) {
  console.log("threadId", threadId);
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const thread = useLiveQuery(
    query.thread.where({
      id: threadId,
    }),
  )[0];

  // Get GitHub integration
  const githubIntegration = useLiveQuery(
    query.integration.first({
      organizationId: currentOrg?.id,
      type: "github",
    }),
  );

  // const [search, setSearch] = useState("");

  // TODO: Replace hardcoded values
  // TODO: Use octokit types and remove any types
  const { data: allIssues } = useQuery({
    queryKey: ["github-issues", currentOrg?.id],
    queryFn: () => {
      if (!currentOrg) return [];

      // Check if GitHub integration is enabled and configured
      if (!githubIntegration?.enabled || !githubIntegration?.configStr) {
        return [];
      }

      return fetchClient.mutate.thread.fetchGithubIssues({
        organizationId: currentOrg.id,
        state: "open",
      });
    },
    enabled: !!currentOrg && !!githubIntegration?.enabled,
  });

  // const itemsForView = prepareCreatableItems(allIssues.issues, search, true);

  const activeIssue = allIssues?.issues?.filter(
    (issue: any) => issue.id.toString() === thread.issueId,
  )[0];

  console.log("activeIssue", activeIssue);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-foreground-secondary text-xs">Issues</div>
      <div className="flex flex-col gap-1.5">
        <Combobox
          items={allIssues?.issues}
          value={
            allIssues?.issues
              ?.filter((issue: any) => issue.id.toString() === thread.issueId)
              .map((issue: any) => issue.body) ?? []
          }
          // onValueChange={async (next) => {
          //   const creatableSelection = next.find((item) =>
          //     item.startsWith("create:"),
          //   );

          //   if (creatableSelection) {
          //     const newItem = creatableSelection.replace("create:", "");
          //     if (!currentOrg?.id) return;

          //     const newLabelId = ulid().toLowerCase();

          //     mutate.label.insert({
          //       id: newLabelId,
          //       name: newItem,
          //       color: "var(--label-color-red)",
          //       createdAt: new Date(),
          //       updatedAt: new Date(),
          //       organizationId: currentOrg?.id,
          //       enabled: true,
          //     });

          //     // TODO remove this once we have a proper transaction system
          //     setTimeout(() => {
          //       mutate.threadLabel.insert({
          //         id: ulid().toLowerCase(),
          //         threadId: threadId,
          //         labelId: newLabelId,
          //         enabled: true,
          //       });
          //     }, 100);
          //   } else {
          //     const nextLabelSet = new Set(
          //       next.filter((i) => !i.startsWith("create:")),
          //     );

          //     const currentLabelSet = new Set(
          //       threadLabels
          //         ?.filter((tl) => tl.enabled)
          //         .map((tl) => tl.label.id) ?? [],
          //     );

          //     // Create a map of labelId -> threadLabel for quick lookup
          //     const threadLabelMap = new Map(
          //       threadLabels?.map((tl) => [tl.label.id, tl]) ?? [],
          //     );

          //     // Labels to add (in next but not in current)
          //     const labelsToAdd = Array.from(nextLabelSet).filter(
          //       (labelId) => !currentLabelSet.has(labelId),
          //     );

          //     // Labels to remove (in current but not in next)
          //     const labelsToRemove = Array.from(currentLabelSet).filter(
          //       (labelId) => !nextLabelSet.has(labelId),
          //     );

          //     // Add labels
          //     for (const labelId of labelsToAdd) {
          //       const existingThreadLabel = threadLabelMap.get(labelId);

          //       if (existingThreadLabel) {
          //         // Update existing connection
          //         mutate.threadLabel.update(existingThreadLabel.id, {
          //           enabled: true,
          //         });
          //       } else {
          //         // Insert new connection
          //         mutate.threadLabel.insert({
          //           id: ulid().toLowerCase(),
          //           threadId: threadId,
          //           labelId: labelId,
          //           enabled: true,
          //         });
          //       }
          //     }

          //     // Remove labels (set enabled to false)
          //     for (const labelId of labelsToRemove) {
          //       const existingThreadLabel = threadLabelMap.get(labelId);

          //       if (existingThreadLabel) {
          //         mutate.threadLabel.update(existingThreadLabel.id, {
          //           enabled: false,
          //         });
          //       }
          //     }
          //   }
          //   setSearch("");
          // }}
          // inputValue={search}
          // onInputValueChange={setSearch}
        >
          <ComboboxTrigger
            variant="unstyled"
            render={
              <ActionButton
                size="sm"
                variant="ghost"
                className={cn(
                  "justify-start text-sm px-2 w-full py-1 max-w-40 has-[>svg]:px-2",
                  activeIssue &&
                    "hover:bg-transparent active:bg-transparent h-auto max-w-none dark:hover:bg-transparent dark:active:bg-transparent",
                )}
                tooltip="Link issue"
                keybind="i"
              >
                {activeIssue ? (
                  <>
                    <Github className="size-4" />
                    <span>
                      #{activeIssue.number} {activeIssue.body}
                    </span>
                  </>
                ) : (
                  <>
                    <Github className="size-4 text-foreground-secondary" />
                    <span className="text-foreground-secondary">
                      Link issue
                    </span>
                  </>
                )}
              </ActionButton>
            }
          />

          <ComboboxContent className="w-48" side="left">
            <ComboboxInput placeholder="Search..." />
            <ComboboxEmpty />
            <ComboboxList>
              {(item: any) =>
                item.creatable ? (
                  <ComboboxCreatableItem key={item.id} value={item.id}>
                    {item.body}
                  </ComboboxCreatableItem>
                ) : (
                  <ComboboxItem key={item.id} value={item.id}>
                    #{item.number} {item.body}
                  </ComboboxItem>
                )
              }
            </ComboboxList>
            <ComboboxFooter>
              <ActionButton
                variant="ghost"
                size="sm"
                className="hover:bg-transparent" //TODO: Actually remove hover style
                tooltip="Create issue"
                keybind="c" //TODO: Verify if needed since search bar is present
              >
                <Plus className="size-4" />
                Create issue
              </ActionButton>
            </ComboboxFooter>
          </ComboboxContent>
        </Combobox>
      </div>
    </div>
  );
}
