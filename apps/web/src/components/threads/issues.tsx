import { useLiveQuery } from "@live-state/sync/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { ActionButton, Button } from "@workspace/ui/components/button";
import {
  BaseItem,
  BaseItemGroup,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  prepareFooter,
} from "@workspace/ui/components/combobox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { KeybindIsolation } from "@workspace/ui/components/keybind";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import { useAtomValue } from "jotai/react";
import { Github, Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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

type Repository = {
  owner: string;
  name: string;
  fullName: string;
};

interface IssuesSectionProps {
  threadId: string;
  externalIssueId: string | null;
  user: { id: string; name: string };
  threadName?: string;
}

export function IssuesSection({
  threadId,
  externalIssueId,
  user,
  threadName,
}: IssuesSectionProps) {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueBody, setIssueBody] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [search, setSearch] = useState("");

  const githubIntegration = useLiveQuery(
    query.integration.first({
      organizationId: currentOrg?.id,
      type: "github",
    }),
  );

  const { data: allIssues, refetch: refetchIssues } = useQuery({
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

  const comboboxItems = prepareFooter(
    issues.map((issue) => ({
      value: issue.id?.toString() ?? "",
      label: `${issue.repository.fullName}#${issue.number} ${issue.title}`,
      issue,
    })),
    [
      {
        value: `footer:create_issue`,
        label: `Create issue ${search}`, // This forces item to always be shown even though it's not visible
      },
    ],
  );

  const linkedIssue = issues.find(
    (issue) => issue.id.toString() === externalIssueId,
  );

  const repos: Repository[] = githubIntegration?.configStr
    ? (() => {
        try {
          const config = JSON.parse(githubIntegration.configStr);
          return config.repos ?? [];
        } catch {
          return [];
        }
      })()
    : [];

  const handleOpenCreateDialog = () => {
    setIssueTitle(threadName ?? "");
    setIssueBody("");
    setSelectedRepo(repos[0]?.fullName ?? "");
    setShowCreateDialog(true);
  };

  const handleCreateIssue = async () => {
    if (!currentOrg || !selectedRepo || !issueTitle.trim()) return;

    const repo = repos.find((r) => r.fullName === selectedRepo);
    if (!repo) return;

    setIsCreating(true);
    try {
      const result = await fetchClient.mutate.thread.createGithubIssue({
        organizationId: currentOrg.id,
        threadId,
        title: issueTitle.trim(),
        body: issueBody,
        owner: repo.owner,
        repo: repo.name,
      });

      if (
        !result?.issue?.id ||
        !result?.issue?.number ||
        !result?.issue?.html_url
      ) {
        throw new Error("Invalid response from GitHub API");
      }

      // Link the thread to the newly created issue
      mutate.thread.update(threadId, {
        externalIssueId: result.issue.id.toString(),
      });

      // Add update record for issue creation
      mutate.update.insert({
        id: ulid().toLowerCase(),
        threadId: threadId,
        type: "issue_changed",
        createdAt: new Date(),
        userId: user.id,
        metadataStr: JSON.stringify({
          oldIssueId: null,
          newIssueId: result.issue.id.toString(),
          oldIssueLabel: null,
          newIssueLabel: `${repo.fullName}#${result.issue.number}`,
          userName: user.name,
        }),
        replicatedStr: JSON.stringify({}),
      });

      // Invalidate issues query to refetch the list
      queryClient.invalidateQueries({ queryKey: ["github-issues"] });

      toast.success("Issue created successfully", {
        duration: 10000,
        action: {
          label: "View on GitHub",
          onClick: () => window.open(result.issue.html_url, "_blank"),
        },
        actionButtonStyle: {
          background: "transparent",
          color: "hsl(var(--primary))",
          border: "none",
          textDecoration: "underline",
        },
      });

      setShowCreateDialog(false);
    } catch (error) {
      console.error("Failed to create issue:", error);
      toast.error("Failed to create issue");
    } finally {
      setIsCreating(false);
    }
  };

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

  if (!githubIntegration || !githubIntegration.enabled) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-foreground-secondary text-xs">Issues</div>
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1 items-center group w-full max-w-52">
          <Combobox
            items={comboboxItems}
            value={linkedIssue?.id.toString() ?? ""}
            onOpenChange={(open) => {
              if (open) {
                refetchIssues();
              }
            }}
            onValueChange={(value) => {
              if (value?.startsWith("footer:")) {
                return;
              }

              const oldIssueId = externalIssueId ?? null;
              const oldIssue = issues.find(
                (issue) => issue.id.toString() === oldIssueId,
              );
              // If clicking the same issue, unlink it
              const newIssueId = oldIssueId === value ? null : value || null;
              const newIssue = newIssueId
                ? issues.find((issue) => issue.id.toString() === newIssueId)
                : undefined;
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
                  className="justify-start text-sm w-full p-0 grow shrink has-[>svg]:px-2 h-7"
                  tooltip="Link issue"
                  keybind="i"
                >
                  {linkedIssue ? (
                    <>
                      <Github className="size-4 shrink-0" />
                      <span className="truncate shrink grow text-left">
                        #{linkedIssue.number} {linkedIssue.title}
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
            <ComboboxContent className="w-60" side="left">
              {/* //TODO: Improve search functionality by searching the issue number */}
              <ComboboxInput
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <ComboboxEmpty>No issues found</ComboboxEmpty>
              <ComboboxList>
                {(group: BaseItemGroup) =>
                  !group.footer ? (
                    <ComboboxGroup key={group.value} items={group.items}>
                      <ComboboxGroupContent>
                        {(item: BaseItem & { issue: GitHubIssue }) => (
                          <ComboboxItem key={item.value} value={item.value}>
                            <span>#{item.issue.number}</span>
                            <span className="truncate">{item.issue.title}</span>
                          </ComboboxItem>
                        )}
                      </ComboboxGroupContent>
                    </ComboboxGroup>
                  ) : (
                    <ComboboxGroup key={group.value} items={group.items}>
                      <ComboboxSeparator />
                      <ComboboxItem
                        value="footer:create_issue"
                        onClick={handleOpenCreateDialog}
                      >
                        <Plus className="size-4" />
                        Create issue
                      </ComboboxItem>
                    </ComboboxGroup>
                  )
                }
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          {linkedIssue && (
            <ActionButton
              variant="ghost"
              size="icon"
              onClick={handleUnlinkIssue}
              tooltip="Unlink issue"
              className="hidden group-hover:flex shrink-0"
            >
              <X className="size-4" />
            </ActionButton>
          )}
        </div>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]" showCloseButton={false}>
          <DialogHeader className="justify-between flex-row items-center">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>New Issue</BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem className="text-foreground-primary">
                  <Select
                    value={selectedRepo}
                    onValueChange={(value) => setSelectedRepo(value as string)}
                  >
                    <SelectTrigger
                      id="repo"
                      size="xs"
                      hideIcon
                      className="px-1"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {repos.map((repo) => (
                        <SelectItem key={repo.fullName} value={repo.fullName}>
                          {repo.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <DialogClose />
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Title</Label>
              <KeybindIsolation>
                <Input
                  id="title"
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  placeholder="Issue title"
                />
              </KeybindIsolation>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="body">Description</Label>
              <KeybindIsolation>
                <Textarea
                  id="body"
                  value={issueBody}
                  onChange={(e) => setIssueBody(e.target.value)}
                  placeholder="Describe the issue..."
                  rows={4}
                />
              </KeybindIsolation>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateIssue}
              disabled={isCreating || !issueTitle.trim() || !selectedRepo}
            >
              {isCreating && <Loader2 className="size-4 animate-spin" />}
              Create Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
