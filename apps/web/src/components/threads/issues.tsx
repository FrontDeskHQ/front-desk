import { useLiveQuery } from "@live-state/sync/client";
import { useMutation } from "@tanstack/react-query";
import type { ExternalRepository } from "@workspace/schemas/external-issue";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { ActionButton, Button } from "@workspace/ui/components/button";
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
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient, mutate, query } from "~/lib/live-state";
import { entityMatchesQuery, type MirrorEntity } from "./external-entities";

/** The facets the link UI needs to display a linked issue (mirror row subset). */
type LinkedIssue = Pick<
  MirrorEntity,
  "externalKey" | "number" | "title" | "repoFullName"
>;

interface IssuesSectionProps {
  threadId: string;
  externalIssueId: string | null;
  user: { id: string; name: string };
  threadName?: string;
  captureThreadEvent: (
    eventName: string,
    properties?: Record<string, unknown>,
  ) => void;
}

export function IssuesSection({
  threadId,
  externalIssueId,
  user,
  threadName,
  captureThreadEvent,
}: IssuesSectionProps) {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueBody, setIssueBody] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [search, setSearch] = useState("");
  const [optimisticIssue, setOptimisticIssue] = useState<LinkedIssue | null>(
    null,
  );

  const githubIntegration = useLiveQuery(
    query.integration.first({
      organizationId: currentOrg?.id,
      type: "github",
    }),
  );

  // Reactive mirror of the org's GitHub issues, synced via Live-State. Replaces
  // the on-demand `thread.fetchGithubIssues` fetch.
  const issues =
    useLiveQuery(
      query.externalEntity.where({
        organizationId: currentOrg?.id,
        type: "issue",
        deletedAt: null,
      }),
    ) ?? [];

  // Once the created issue lands in the mirror (via webhook upsert), drop the
  // optimistic placeholder and let the synced row take over.
  useEffect(() => {
    if (
      optimisticIssue &&
      issues.some((issue) => issue.externalKey === optimisticIssue.externalKey)
    ) {
      setOptimisticIssue(null);
    }
  }, [issues, optimisticIssue]);

  // The link list only offers open issues; the linked issue itself resolves from
  // the full mirror so an already-linked closed issue still displays.
  const openIssues = issues.filter((issue) => issue.state === "open");

  const comboboxItems = prepareFooter(
    openIssues.map((issue) => ({
      value: issue.externalKey,
      label: `${issue.repoFullName}#${issue.number} ${issue.title}`,
      issue,
    })),
    [
      {
        value: `footer:create_issue`,
        label: `Create issue ${search}`, // This forces item to always be shown even though it's not visible
      },
    ],
  );

  const linkedIssue: LinkedIssue | undefined =
    issues.find((issue) => issue.externalKey === externalIssueId) ??
    (optimisticIssue?.externalKey === externalIssueId
      ? optimisticIssue
      : undefined);

  const repos: ExternalRepository[] = githubIntegration?.configStr
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

  const createIssueMutation = useMutation({
    mutationFn: async ({
      title,
      body,
      owner,
      repo,
    }: {
      title: string;
      body: string;
      owner: string;
      repo: string;
    }) => {
      if (!currentOrg) throw new Error("No organization selected");

      const result = await fetchClient.mutate.thread.createIssue({
        organizationId: currentOrg.id,
        threadId,
        title: title.trim(),
        body,
        target: { owner, repo },
      });

      if (!result?.issue?.id || !result?.issue?.shortId || !result?.issue?.url) {
        throw new Error("Invalid response from GitHub API");
      }

      return result;
    },
    onSuccess: (result, variables) => {
      const repo = repos.find((r) => r.fullName === selectedRepo);
      if (!repo || !result?.issue || !currentOrg) return;

      // Optimistic placeholder so the link shows immediately; the real mirror
      // row arrives shortly after via the GitHub webhook upsert.
      setOptimisticIssue({
        externalKey: result.issue.id,
        // The mirror row is GitHub-shaped (numeric `number`); parse the neutral
        // `shortId` back to an int here in the GitHub-specific UI.
        number: Number(result.issue.shortId),
        title: result.issue.title || variables.title,
        repoFullName: repo.fullName,
      });

      // Link the thread to the newly created issue by its externalKey.
      mutate.thread.linkIssue({
        threadId,
        organizationId: currentOrg.id,
        externalIssueId: result.issue.id,
        userId: user.id,
        userName: user.name,
      });

      toast.success("Issue created successfully", {
        duration: 10000,
        action: {
          label: "View on GitHub",
          onClick: () =>
            window.open(result.issue.url, "_blank", "noopener,noreferrer"),
        },
        actionButtonStyle: {
          background: "transparent",
          color: "hsl(var(--primary))",
          border: "none",
          textDecoration: "underline",
        },
      });

      setShowCreateDialog(false);
    },
    onError: (error) => {
      console.error("Failed to create issue:", error);
      toast.error("Failed to create issue");
    },
  });

  const handleCreateIssue = () => {
    if (!currentOrg || !selectedRepo || !issueTitle.trim()) return;

    const repo = repos.find((r) => r.fullName === selectedRepo);
    if (!repo) return;

    createIssueMutation.mutate({
      title: issueTitle.trim(),
      body: issueBody,
      owner: repo.owner,
      repo: repo.name,
    });
  };

  const handleUnlinkIssue = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!externalIssueId || !linkedIssue || !currentOrg) return;

    mutate.thread.unlinkIssue({
      threadId,
      organizationId: currentOrg.id,
      userId: user.id,
      userName: user.name,
    });

    captureThreadEvent("thread:issue_unlink", {
      old_issue_id: externalIssueId,
      old_issue_number: linkedIssue.number,
      repository: linkedIssue.repoFullName,
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
            value={linkedIssue?.externalKey ?? ""}
            filter={(item, q) => {
              const it = item as { value?: string; issue?: MirrorEntity };
              if (
                typeof it.value === "string" &&
                it.value.startsWith("footer:")
              )
                return true;
              if (!it.issue) return true;
              return entityMatchesQuery(it.issue, q);
            }}
            onValueChange={(value) => {
              if (value?.startsWith("footer:") || !currentOrg) {
                return;
              }

              const oldIssueId = externalIssueId ?? null;
              const oldIssue = issues.find(
                (issue) => issue.externalKey === oldIssueId,
              );
              // If clicking the same issue, unlink it
              const newIssueId = oldIssueId === value ? null : value || null;
              const newIssue = newIssueId
                ? issues.find((issue) => issue.externalKey === newIssueId)
                : undefined;

              if (newIssueId) {
                mutate.thread.linkIssue({
                  threadId,
                  organizationId: currentOrg.id,
                  externalIssueId: newIssueId,
                  userId: user.id,
                  userName: user.name,
                });

                captureThreadEvent("thread:issue_link", {
                  old_issue_id: oldIssueId,
                  new_issue_id: newIssueId,
                  old_issue_number: oldIssue?.number,
                  new_issue_number: newIssue?.number,
                  repository: newIssue?.repoFullName,
                });
              } else {
                mutate.thread.unlinkIssue({
                  threadId,
                  organizationId: currentOrg.id,
                  userId: user.id,
                  userName: user.name,
                });

                captureThreadEvent("thread:issue_unlink", {
                  old_issue_id: oldIssueId,
                  old_issue_number: oldIssue?.number,
                  repository: oldIssue?.repoFullName,
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
            <ComboboxContent className="w-60 max-h-120" side="left">
              <ComboboxInput
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <ComboboxEmpty>No issues found</ComboboxEmpty>
              <ComboboxList className="overflow-hidden flex flex-col">
                {(group: BaseItemGroup) =>
                  !group.footer ? (
                    <ComboboxGroup
                      key={group.value}
                      items={group.items}
                      className="overflow-auto grow shrink"
                    >
                      <ComboboxGroupContent>
                        {(item: BaseItem & { issue: MirrorEntity }) => (
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
              disabled={createIssueMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateIssue}
              disabled={
                createIssueMutation.isPending ||
                !issueTitle.trim() ||
                !selectedRepo
              }
            >
              {createIssueMutation.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Create Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
