import { useLiveQuery } from "@live-state/sync/client";
import { ActionButton } from "@workspace/ui/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@workspace/ui/components/combobox";
import { useAtomValue } from "jotai/react";
import { GitPullRequest, X } from "lucide-react";
import { useState } from "react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { useOrgCapability } from "~/lib/hooks/query/use-org-capability";
import { mutate, query } from "~/lib/live-state";
import { entityMatchesQuery, type MirrorEntity } from "./external-entities";
import { LinkedPrSuggestionsSection } from "./linked-pr-suggestions-section";

interface PullRequestsSectionProps {
  threadId: string;
  externalPrId: string | null;
  user: { id: string; name: string };
  captureThreadEvent: (
    eventName: string,
    properties?: Record<string, unknown>,
  ) => void;
}

export function PullRequestsSection({
  threadId,
  externalPrId,
  user,
  captureThreadEvent,
}: PullRequestsSectionProps) {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const [search, setSearch] = useState("");

  // Gate the whole section on the capability, not on a named provider.
  const hasPrTracker = useOrgCapability("pr-tracker");

  // Reactive mirror of the org's pull requests, synced via Live-State. Replaces
  // the on-demand `thread.fetchGithubPullRequests` fetch.
  const pullRequests =
    useLiveQuery(
      query.externalEntity.where({
        organizationId: currentOrg?.id,
        type: "pull_request",
        deletedAt: null,
      }),
    ) ?? [];

  // The link list only offers open PRs; the linked PR itself resolves from the
  // full mirror so an already-linked closed/merged PR still displays.
  const openPullRequests = pullRequests.filter((pr) => pr.state === "open");

  const comboboxItems = openPullRequests.map((pr) => ({
    value: pr.externalKey,
    label: `${pr.repoFullName}#${pr.number} ${pr.title}`,
    pr,
  }));

  type PRItem = (typeof comboboxItems)[number];

  const linkedPr = pullRequests.find((pr) => pr.externalKey === externalPrId);

  const handleUnlinkPr = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!externalPrId || !linkedPr || !currentOrg) return;

    mutate.thread.unlinkPullRequest({
      threadId,
      organizationId: currentOrg.id,
      userId: user.id,
      userName: user.name,
    });

    captureThreadEvent("thread:pr_unlink", {
      old_pr_id: externalPrId,
      old_pr_number: linkedPr.number,
      repository: linkedPr.repoFullName,
    });
  };

  if (!hasPrTracker) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-foreground-secondary text-xs">Pull Requests</div>
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1 items-center group w-full max-w-52">
          <Combobox
            items={comboboxItems}
            value={linkedPr?.externalKey ?? ""}
            filter={(item, q) => {
              const it = item as { pr?: MirrorEntity };
              if (!it.pr) return true;
              return entityMatchesQuery(it.pr, q);
            }}
            onValueChange={(value) => {
              if (!currentOrg) return;

              const oldPrId = externalPrId ?? null;
              const oldPr = pullRequests.find(
                (pr) => pr.externalKey === oldPrId,
              );
              // If clicking the same PR, unlink it
              const newPrId = oldPrId === value ? null : value || null;
              const newPr = newPrId
                ? pullRequests.find((pr) => pr.externalKey === newPrId)
                : undefined;

              if (newPrId) {
                mutate.thread.linkPullRequest({
                  threadId,
                  organizationId: currentOrg.id,
                  externalPrId: newPrId,
                  userId: user.id,
                  userName: user.name,
                });

                captureThreadEvent("thread:pr_link", {
                  old_pr_id: oldPrId,
                  new_pr_id: newPrId,
                  old_pr_number: oldPr?.number,
                  new_pr_number: newPr?.number,
                  repository: newPr?.repoFullName,
                });
              } else {
                mutate.thread.unlinkPullRequest({
                  threadId,
                  organizationId: currentOrg.id,
                  userId: user.id,
                  userName: user.name,
                });

                captureThreadEvent("thread:pr_unlink", {
                  old_pr_id: oldPrId,
                  old_pr_number: oldPr?.number,
                  repository: oldPr?.repoFullName,
                });
              }
            }}
          >
            <ComboboxTrigger
              variant="unstyled"
              render={
                <ActionButton
                  size="sm"
                  variant="ghost"
                  className="justify-start text-sm w-full p-0 grow shrink has-[>svg]:px-2 h-7"
                  tooltip="Link pull request"
                  keybind="shift+p"
                >
                  {linkedPr ? (
                    <>
                      <GitPullRequest className="size-4 shrink-0" />
                      <span className="truncate shrink grow text-left">
                        #{linkedPr.number} {linkedPr.title}
                      </span>
                    </>
                  ) : (
                    <>
                      <GitPullRequest className="size-4 text-foreground-secondary" />
                      <span className="text-foreground-secondary">
                        Link pull request
                      </span>
                    </>
                  )}
                </ActionButton>
              }
            />
            <ComboboxContent className="w-60" side="left">
              <ComboboxInput
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <ComboboxEmpty>No pull requests found</ComboboxEmpty>
              <ComboboxList>
                {(item: PRItem) => (
                  <ComboboxItem key={item.value} value={item.value}>
                    <span>#{item.pr.number}</span>
                    <span className="truncate">{item.pr.title}</span>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          {linkedPr && (
            <ActionButton
              variant="ghost"
              size="icon"
              onClick={handleUnlinkPr}
              tooltip="Unlink pull request"
              className="hidden group-hover:flex shrink-0"
            >
              <X className="size-4" />
            </ActionButton>
          )}
        </div>
        <LinkedPrSuggestionsSection
          threadId={threadId}
          externalPrId={externalPrId}
          user={user}
          captureThreadEvent={captureThreadEvent}
        />
      </div>
    </div>
  );
}
