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
import { Github } from "lucide-react";
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
  user: { id: string; name: string };
}

export function IssuesSection({ threadId, user }: IssuesSectionProps) {
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

  const { data: allIssues } = useQuery({
    queryKey: ["github-issues", currentOrg?.id],
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
    (issue) => issue.id.toString() === thread?.issueId,
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="text-foreground-secondary text-xs">Issues</div>
      <div className="flex flex-col gap-1.5">
        <Combobox
          items={issues}
          value={linkedIssue?.id.toString() ?? ""}
          onValueChange={(value) => {
            if (!thread) return;

            const oldIssueId = thread.issueId ?? null;
            const oldIssue = issues.find(
              (issue) => issue.id.toString() === oldIssueId,
            );
            // If clicking the same issue, unlink it
            const newIssueId = oldIssueId === value ? null : value || null;
            const newIssue = issues.find(
              (issue) => issue.id.toString() === newIssueId,
            );

            mutate.thread.update(threadId, {
              issueId: newIssueId,
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
                  "justify-start text-sm px-2 w-full py-1 max-w-40 has-[>svg]:px-2",
                  linkedIssue &&
                    "hover:bg-transparent active:bg-transparent h-auto max-w-none dark:hover:bg-transparent dark:active:bg-transparent",
                )}
                tooltip="Link issue"
                keybind="i"
              >
                {linkedIssue ? (
                  <>
                    <Github className="size-4" />
                    <span className="truncate">
                      {linkedIssue.repository.fullName}#{linkedIssue.number}{" "}
                      {linkedIssue.title}
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

          <ComboboxContent className="w-80" side="left">
            <ComboboxInput placeholder="Search..." />
            <ComboboxEmpty>No issues found</ComboboxEmpty>
            <ComboboxList>
              {(item: GitHubIssue) => {
                const isLinked = item.id.toString() === thread?.issueId;
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
