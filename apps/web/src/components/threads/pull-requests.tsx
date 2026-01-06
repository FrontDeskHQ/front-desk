import { useLiveQuery } from "@live-state/sync/client";
import { useQuery } from "@tanstack/react-query";
import { ActionButton } from "@workspace/ui/components/button";
import {
  type BaseItem,
  type BaseItemGroup,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@workspace/ui/components/combobox";
import { useAtomValue } from "jotai/react";
import { GitPullRequest, X } from "lucide-react";
import { useState } from "react";
import { ulid } from "ulid";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient, mutate, query } from "~/lib/live-state";

type GitHubPullRequest = {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  html_url: string;
  repository: {
    owner: string;
    name: string;
    fullName: string;
  };
};

interface PullRequestsSectionProps {
  threadId: string;
  externalPrId: string | null;
  user: { id: string; name: string };
}

export function PullRequestsSection({
  threadId,
  externalPrId,
  user,
}: PullRequestsSectionProps) {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const [search, setSearch] = useState("");

  const githubIntegration = useLiveQuery(
    query.integration.first({
      organizationId: currentOrg?.id,
      type: "github",
    }),
  );

  const { data: allPullRequests } = useQuery({
    queryKey: [
      "github-pull-requests",
      currentOrg?.id,
      githubIntegration?.enabled,
      githubIntegration?.configStr,
    ],
    queryFn: () => {
      if (!currentOrg) return { pullRequests: [], count: 0 };

      if (!githubIntegration?.enabled || !githubIntegration?.configStr) {
        return { pullRequests: [], count: 0 };
      }

      return fetchClient.mutate.thread.fetchGithubPullRequests({
        organizationId: currentOrg.id,
        state: "open",
      });
    },
    enabled: !!currentOrg && !!githubIntegration?.enabled,
  });

  const pullRequests = (allPullRequests?.pullRequests ??
    []) as GitHubPullRequest[];

  const comboboxItems = pullRequests.map((pr) => ({
    value: pr.id?.toString() ?? "",
    label: `${pr.repository.fullName}#${pr.number} ${pr.title}`,
    pr,
  }));

  const linkedPr = pullRequests.find((pr) => pr.id.toString() === externalPrId);

  const handleUnlinkPr = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!externalPrId || !linkedPr) return;

    mutate.thread.update(threadId, {
      externalPrId: null,
    });

    mutate.update.insert({
      id: ulid().toLowerCase(),
      threadId: threadId,
      type: "pr_changed",
      createdAt: new Date(),
      userId: user.id,
      metadataStr: JSON.stringify({
        oldPrId: externalPrId,
        newPrId: null,
        oldPrLabel: `${linkedPr.repository.fullName}#${linkedPr.number}`,
        newPrLabel: null,
        userName: user.name,
      }),
      replicatedStr: JSON.stringify({}),
    });
  };

  if (!githubIntegration || !githubIntegration.enabled) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-foreground-secondary text-xs">Pull Requests</div>
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1 items-center group w-full max-w-52">
          <Combobox
            items={comboboxItems}
            value={linkedPr?.id.toString() ?? ""}
            onValueChange={(value) => {
              const oldPrId = externalPrId ?? null;
              const oldPr = pullRequests.find(
                (pr) => pr.id.toString() === oldPrId,
              );
              // If clicking the same PR, unlink it
              const newPrId = oldPrId === value ? null : value || null;
              const newPr = newPrId
                ? pullRequests.find((pr) => pr.id.toString() === newPrId)
                : undefined;
              mutate.thread.update(threadId, {
                externalPrId: newPrId,
              });
              mutate.update.insert({
                id: ulid().toLowerCase(),
                threadId: threadId,
                type: "pr_changed",
                createdAt: new Date(),
                userId: user.id,
                metadataStr: JSON.stringify({
                  oldPrId,
                  newPrId,
                  oldPrLabel: oldPr
                    ? `${oldPr.repository.fullName}#${oldPr.number}`
                    : null,
                  newPrLabel: newPr
                    ? `${newPr.repository.fullName}#${newPr.number}`
                    : null,
                  userName: user.name,
                }),
                replicatedStr: JSON.stringify({}),
              });
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
                {(group: BaseItemGroup) => (
                  <ComboboxGroup key={group.value} items={group.items}>
                    <ComboboxGroupContent>
                      {(item: BaseItem & { pr: GitHubPullRequest }) => (
                        <ComboboxItem key={item.value} value={item.value}>
                          <span>#{item.pr.number}</span>
                          <span className="truncate">{item.pr.title}</span>
                        </ComboboxItem>
                      )}
                    </ComboboxGroupContent>
                  </ComboboxGroup>
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
      </div>
    </div>
  );
}
