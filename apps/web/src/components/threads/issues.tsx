import { useLiveQuery } from "@live-state/sync/client";
import { useQuery } from "@tanstack/react-query";
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
import { cn } from "@workspace/ui/lib/utils";
import { useAtomValue } from "jotai/react";
import { Github, X } from "lucide-react";
import { ulid } from "ulid";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient, mutate, query } from "~/lib/live-state";

type GitHubIssue = {
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

interface IssuesSectionProps {
  threadId: string;
  externalIssueId: string | null;
  user: { id: string; name: string };
}

export function IssuesSection({
  threadId,
  externalIssueId,
  user,
}: IssuesSectionProps) {
  const currentOrg = useAtomValue(activeOrganizationAtom);

  const githubIntegration = useLiveQuery(
    query.integration.first({
      organizationId: currentOrg?.id,
      type: "github",
    }),
  );

  const { data: allIssues } = useQuery({
    queryKey: [
      "github-issues",
      currentOrg?.id,
      githubIntegration?.enabled,
      githubIntegration?.configStr,
    ],
    queryFn: () => {
      if (!currentOrg) return { issues: [], count: 0 };

      // Check if GitHub integration is enabled and configured
      if (!githubIntegration?.enabled || !githubIntegration?.configStr) {
        return { issues: [], count: 0 };
      }

      return fetchClient.mutate.thread.fetchGithubIssues({
        organizationId: currentOrg.id,
        state: "open",
      });
    },
    enabled: !!currentOrg && !!githubIntegration?.enabled,
  });

  const issues = (allIssues?.issues ?? []) as GitHubIssue[];

  const linkedIssue = issues.find(
    (issue) => issue.id.toString() === externalIssueId,
  );

  const handleUnlinkIssue = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!externalIssueId || !linkedIssue) return;

    mutate.thread.update(threadId, {
      externalIssueId: null,
    });

    mutate.update.insert({
      id: ulid().toLowerCase(),
      threadId: threadId,
      type: "issue_changed",
      createdAt: new Date(),
      userId: user.id,
      metadataStr: JSON.stringify({
        oldIssueId: externalIssueId,
        newIssueId: null,
        oldIssueLabel: `${linkedIssue.repository.fullName}#${linkedIssue.number}`,
        newIssueLabel: null,
        userName: user.name,
      }),
      replicatedStr: JSON.stringify({}),
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="text-foreground-secondary text-xs">Issues</div>
      <div className="flex flex-col gap-1.5">
        <Combobox
          items={issues}
          value={linkedIssue?.id.toString() ?? ""}
          onValueChange={(value) => {
            if (!externalIssueId) return;

            const oldIssueId = externalIssueId ?? null;
            const oldIssue = issues.find(
              (issue) => issue.id.toString() === oldIssueId,
            );
            // If clicking the same issue, unlink it
            const newIssueId = oldIssueId === value ? null : value || null;
            const newIssue = issues.find(
              (issue) => issue.id.toString() === newIssueId,
            );

            mutate.thread.update(threadId, {
              externalIssueId: newIssueId,
            });

            mutate.update.insert({
              id: ulid().toLowerCase(),
              threadId: threadId,
              type: "issue_changed",
              createdAt: new Date(),
              userId: user.id,
              metadataStr: JSON.stringify({
                oldIssueId,
                newIssueId,
                oldIssueLabel: oldIssue
                  ? `${oldIssue.repository.fullName}#${oldIssue.number}`
                  : null,
                newIssueLabel: newIssue
                  ? `${newIssue.repository.fullName}#${newIssue.number}`
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
                className={cn(
                  "justify-start text-sm w-full p-0 max-w-40 has-[>svg]:px-2 hover:bg-transparent active:bg-transparent dark:hover:bg-transparent dark:active:bg-transparent",
                  linkedIssue && "h-auto max-w-none",
                )}
                tooltip="Link issue"
                keybind="i"
              >
                {linkedIssue ? (
                  <div className="flex w-full h-full">
                    <div className="flex items-center gap-2 flex-1 min-w-0 rounded-md px-2 py-1 hover:bg-accent/50 transition-colors">
                      <Github className="size-4 shrink-0" />
                      <span className="truncate">
                        #{linkedIssue.number} {linkedIssue.title}
                      </span>
                    </div>
                    <ActionButton
                      variant="ghost"
                      size="icon-sm"
                      onClick={handleUnlinkIssue}
                      tooltip="Unlink issue"
                    >
                      <X className="size-4" />
                    </ActionButton>
                  </div>
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

          <ComboboxContent className="w-60" side="left">
            {/* //TODO: Improve search functionality by searching the issue number */}
            <ComboboxInput placeholder="Search..." />
            <ComboboxEmpty>No issues found</ComboboxEmpty>
            <ComboboxList>
              {(item: GitHubIssue) => {
                const isLinked =
                  item.id.toString() === externalIssueId?.toString();
                return (
                  <ComboboxItem
                    key={item.id}
                    value={item.id.toString()}
                    className={cn(
                      "flex items-center gap-2",
                      isLinked && "bg-accent",
                    )}
                  >
                    <span>#{item.number}</span>
                    <span className="truncate">{item.title}</span>
                  </ComboboxItem>
                );
              }}
            </ComboboxList>
            {/* //TODO: Implement create issue */}
            {/* <ComboboxFooter>
              <ActionButton
                variant="ghost"
                size="sm"
                className="hover:bg-transparent"
                tooltip="Create issue"
                keybind="c"
              >
                <Plus className="size-4" />
                Create issue
              </ActionButton>
            </ComboboxFooter> */}
          </ComboboxContent>
        </Combobox>
      </div>
    </div>
  );
}
