import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai/react";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient } from "~/lib/live-state";

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
}

export function IssuesSection({ threadId }: { threadId: string }) {
  console.log("threadId", threadId);
  const currentOrg = useAtomValue(activeOrganizationAtom);

  const { data: allIssues, isLoading } = useQuery({
    queryKey: ["github-issues", currentOrg?.id],
    queryFn: () => {
      if (!currentOrg) return [];

      return fetchClient.mutate.thread.fetchGithubIssues({
        organizationId: currentOrg.id,
        owner: "danielmoural",
        repo: "portfolio",
        state: "open",
      });
    },
    enabled: !!currentOrg,
  });

  console.log("allIssues", allIssues);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-foreground-secondary text-xs">Issues</div>
        <div className="text-foreground-secondary text-xs">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-foreground-secondary text-xs">Issues</div>
      <div className="flex flex-col gap-1.5">
        {allIssues?.issues?.map((issue: GitHubIssue) => (
          <div key={issue.id} className="px-2 py-1 rounded bg-muted">
            {issue.title}
          </div>
        ))}
      </div>
    </div>
  );
}
