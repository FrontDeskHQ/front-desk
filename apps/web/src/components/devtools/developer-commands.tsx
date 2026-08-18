"use client";

import { useLiveQuery } from "@live-state/sync/client";
import { useNavigate } from "@tanstack/react-router";
import { githubIntegrationSchema } from "@workspace/schemas/integration/github";
import {
  Archive,
  Bug,
  Clipboard,
  EyeOff,
  Flag,
  GitPullRequest,
  Github,
  History,
  ListRestart,
  RefreshCw,
  ScanSearch,
  Terminal,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useCommand, useCommandPage } from "~/lib/commands/hooks";
import type { Command, CommandPage } from "~/lib/commands/types";
import {
  buildRepositoryBackfillPayload,
  getEligibleDeveloperPullRequests,
  toggleRepositorySelection,
} from "~/lib/developer-tools/github-selection";
import { reflagClient } from "~/lib/feature-flag";
import { fetchClient, query } from "~/lib/live-state";
import { buildThreadParam } from "~/utils/thread";

import {
  COPY_AGENT_RUN_PAGE_ID,
  useCopyAgentRunPage,
} from "./devtools-menu/copy-agent-run-page";
import { copyLatestAgentRunDataFromParam } from "./devtools-menu/copy-latest-agent-run-command";
import { CreateThreadDialog } from "./devtools-menu/create-thread-dialog";
import { duplicateThreadFromParam } from "./devtools-menu/duplicate-thread-command";
import type { DuplicatedThread } from "./devtools-menu/duplicate-thread-command";
import { retriggerThreadReadFromParam } from "./devtools-menu/retrigger-thread-read-command";
import { useThreadRouteRawParam } from "./devtools-menu/thread-route-for-devtools";
import { useReactScanEnabled } from "./react-scan";

const DEVELOPER_TOOLS_PAGE_ID = "developer-tools";
const DEVELOPER_THREADS_PAGE_ID = "developer-tools.threads";
const DEVELOPER_GITHUB_PAGE_ID = "developer-tools.github";
const DEVELOPER_GITHUB_PR_PAGE_ID = "developer-tools.github.prs";
const DEVELOPER_GITHUB_BACKFILL_PAGE_ID = "developer-tools.github.backfill";
const DEVELOPER_SIGNALS_PAGE_ID = "developer-tools.signals";
const DEVELOPER_FLAGS_PAGE_ID = "developer-tools.flags";

interface DeveloperToolsCommandsProps {
  onHideToolbar: (mode: "temporary" | "section") => void;
  onOpenLiveStateLog: () => void;
  organizationId: string;
}

interface GithubRepo {
  fullName: string;
  name: string;
  owner: string;
}

interface FlagState {
  flagKey: string;
  isEnabled: boolean;
}

export const DeveloperToolsCommands = ({
  onHideToolbar,
  onOpenLiveStateLog,
  organizationId,
}: DeveloperToolsCommandsProps) => {
  const navigate = useNavigate();
  const rawThreadParam = useThreadRouteRawParam();
  const [createThreadOpen, setCreateThreadOpen] = useState(false);
  const [reactScanEnabled, setReactScanEnabled] = useReactScanEnabled();
  const [selectedRepositories, setSelectedRepositories] = useState<string[]>(
    []
  );
  const [flags, setFlags] = useState<Record<string, FlagState>>({});
  const [flagsLoading, setFlagsLoading] = useState(import.meta.env.DEV);

  const githubIntegration = useLiveQuery(
    query.integration.first({
      enabled: true,
      organizationId,
      type: "github",
    })
  );

  const mirroredPullRequests = useLiveQuery(
    query.externalEntity.where({
      deletedAt: null,
      organizationId,
      type: "pull_request",
    })
  );

  const githubRepos = useMemo<GithubRepo[]>(() => {
    if (!githubIntegration?.configStr) {
      return [];
    }

    try {
      const parsed = githubIntegrationSchema.safeParse(
        JSON.parse(githubIntegration.configStr)
      );
      if (!parsed.success) {
        return [];
      }

      return [...(parsed.data.repos ?? [])].toSorted((a, b) =>
        a.fullName.localeCompare(b.fullName)
      );
    } catch {
      return [];
    }
  }, [githubIntegration?.configStr]);

  const eligiblePullRequests = useMemo(
    () => getEligibleDeveloperPullRequests(mirroredPullRequests ?? []),
    [mirroredPullRequests]
  );

  const selectedRepositorySet = useMemo(
    () => new Set(selectedRepositories),
    [selectedRepositories]
  );

  const loadFlags = useCallback(() => {
    if (!import.meta.env.DEV) {
      setFlagsLoading(false);
      return;
    }

    try {
      const flagsState: Record<string, FlagState> = {};
      for (const [flagKey, flag] of Object.entries(reflagClient.getFlags())) {
        flagsState[flagKey] = {
          flagKey,
          isEnabled: flag.isEnabledOverride ?? flag.isEnabled ?? false,
        };
      }
      setFlags(flagsState);
    } catch (error) {
      console.error("Failed to load feature flags:", error);
    } finally {
      setFlagsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    loadFlags();
    const unsubscribeFlagsUpdated = reflagClient.on("flagsUpdated", loadFlags);
    const unsubscribeStateUpdated = reflagClient.on("stateUpdated", loadFlags);

    return () => {
      if (typeof unsubscribeFlagsUpdated === "function") {
        unsubscribeFlagsUpdated();
      }
      if (typeof unsubscribeStateUpdated === "function") {
        unsubscribeStateUpdated();
      }
    };
  }, [loadFlags]);

  useEffect(() => {
    setSelectedRepositories([]);
  }, [organizationId]);

  const invokeGithubAction = useCallback(
    async ({
      action,
      payload,
      successMessage,
    }: {
      action: "pr_match_replay" | "repository_backfill";
      payload: Record<string, unknown>;
      successMessage: string;
    }) => {
      try {
        const result = await fetchClient.mutate.developerAction.invoke({
          action,
          connectorType: "github",
          organizationId,
          payload,
        });

        console.info("[Developer tools] GitHub action accepted", {
          action,
          jobIds: result.jobIds,
          organizationId,
          target: result.target,
        });
        toast.success(successMessage);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "unknown";
        console.error("[Developer tools] GitHub action failed", {
          action,
          error: errorMessage,
          organizationId,
        });
        toast.error("GitHub developer action failed");
      }
    },
    [organizationId]
  );

  const handleDuplicateThread = useCallback(() => {
    void duplicateThreadFromParam({
      activeOrganizationId: organizationId,
      onSuccess: (thread: DuplicatedThread) => {
        navigate({
          params: { id: buildThreadParam(thread) },
          to: "/app/threads/$id",
        });
      },
      rawParam: rawThreadParam,
    });
  }, [navigate, organizationId, rawThreadParam]);

  const handleRetriggerThreadRead = useCallback(() => {
    void retriggerThreadReadFromParam({
      activeOrganizationId: organizationId,
      rawParam: rawThreadParam,
    });
  }, [organizationId, rawThreadParam]);

  const handleCopyLatestAgentRunData = useCallback(() => {
    void copyLatestAgentRunDataFromParam({
      activeOrganizationId: organizationId,
      rawParam: rawThreadParam,
    });
  }, [organizationId, rawThreadParam]);

  useCopyAgentRunPage({ organizationId, rawThreadParam });

  const threadsPage: CommandPage = {
    commands: [
      {
        icon: <Terminal />,
        id: "developer-tools.create-thread",
        label: "Create thread",
        onSelect: () => setCreateThreadOpen(true),
      },
      {
        disabled: !rawThreadParam,
        icon: <Archive />,
        id: "developer-tools.duplicate-thread",
        label: "Duplicate current thread",
        onSelect: handleDuplicateThread,
      },
      {
        disabled: !rawThreadParam,
        icon: <RefreshCw />,
        id: "developer-tools.retrigger-thread-read",
        label: "Retrigger current thread read",
        onSelect: handleRetriggerThreadRead,
      },
      {
        disabled: !rawThreadParam,
        icon: <Clipboard />,
        id: "developer-tools.copy-latest-agent-run",
        label: "Copy latest agent run data",
        onSelect: handleCopyLatestAgentRunData,
      },
      {
        disabled: !rawThreadParam,
        icon: <History />,
        id: "developer-tools.copy-agent-run",
        label: "Copy Agent run...",
        pageId: COPY_AGENT_RUN_PAGE_ID,
      },
    ],
    icon: <Terminal />,
    id: DEVELOPER_THREADS_PAGE_ID,
    label: "Threads",
  };

  const githubPrPage: CommandPage = {
    commands:
      eligiblePullRequests.length > 0
        ? eligiblePullRequests.map((pullRequest) => ({
            group: pullRequest.repoFullName,
            icon: <GitPullRequest />,
            id: `developer-tools.github.replay.${pullRequest.id}`,
            keywords: [
              "github",
              "replay",
              pullRequest.repoFullName,
              `#${pullRequest.number}`,
            ],
            label: `#${pullRequest.number} ${pullRequest.title || "Untitled pull request"}`,
            onSelect: () => {
              void invokeGithubAction({
                action: "pr_match_replay",
                payload: { entityId: pullRequest.id },
                successMessage: `Accepted replay for ${pullRequest.repoFullName}#${pullRequest.number}`,
              });
            },
          }))
        : [
            {
              disabled: true,
              icon: <GitPullRequest />,
              id: "developer-tools.github.replay.empty",
              label: "No eligible open, non-draft mirrored pull requests",
              onSelect: () => undefined,
            },
          ],
    icon: <GitPullRequest />,
    id: DEVELOPER_GITHUB_PR_PAGE_ID,
    label: "Replay GitHub PR match",
  };

  const githubBackfillPage: CommandPage = {
    commands:
      githubRepos.length > 0
        ? [
            {
              disabled: selectedRepositories.length === 0,
              icon: <RefreshCw />,
              id: "developer-tools.github.backfill.selected",
              label: `Run selected backfill (${selectedRepositories.length})`,
              onSelect: () => {
                const payload = buildRepositoryBackfillPayload({
                  allRepositories: false,
                  selectedRepositories,
                });
                if (payload.allRepositories) {
                  return;
                }
                void invokeGithubAction({
                  action: "repository_backfill",
                  payload,
                  successMessage: `Accepted backfill for ${payload.repositories.length} repositor${payload.repositories.length === 1 ? "y" : "ies"}`,
                });
                setSelectedRepositories([]);
              },
            },
            {
              icon: <ListRestart />,
              id: "developer-tools.github.backfill.all",
              label: "Backfill all repositories",
              onSelect: () => {
                void invokeGithubAction({
                  action: "repository_backfill",
                  payload: { allRepositories: true },
                  successMessage: "Accepted backfill for all repositories",
                });
              },
            },
            ...githubRepos.map((repo) => ({
              checked: selectedRepositorySet.has(repo.fullName),
              group: "Select repositories",
              icon: <Github />,
              id: `developer-tools.github.backfill.${repo.fullName}`,
              keywords: ["github", "backfill", repo.owner, repo.name],
              keepOpen: true,
              label: repo.fullName,
              onSelect: () => {
                setSelectedRepositories((current) =>
                  toggleRepositorySelection(current, repo.fullName)
                );
              },
            })),
          ]
        : [
            {
              disabled: true,
              icon: <Github />,
              id: "developer-tools.github.backfill.empty",
              label: "No connected GitHub repositories",
              onSelect: () => undefined,
            },
          ],
    icon: <RefreshCw />,
    id: DEVELOPER_GITHUB_BACKFILL_PAGE_ID,
    label: "Backfill GitHub repositories",
  };

  const githubPage: CommandPage = {
    commands: [
      {
        icon: <GitPullRequest />,
        id: "developer-tools.github.replay",
        label: "Replay GitHub PR match...",
        pageId: DEVELOPER_GITHUB_PR_PAGE_ID,
      },
      {
        icon: <RefreshCw />,
        id: "developer-tools.github.backfill",
        label: "Backfill GitHub repositories...",
        pageId: DEVELOPER_GITHUB_BACKFILL_PAGE_ID,
      },
    ],
    icon: <Github />,
    id: DEVELOPER_GITHUB_PAGE_ID,
    label: "GitHub",
  };

  const signalsPage: CommandPage = {
    commands: import.meta.env.DEV
      ? [
          {
            icon: <Bug />,
            id: "developer-tools.signals.seed",
            label: "Seed leverage actions",
            onSelect: async () => {
              try {
                const result =
                  await fetchClient.mutate.autonomousAction.seedFake({
                    count: 8,
                    organizationId,
                  });
                toast.success(`Seeded ${result.inserted} autonomous actions`);
              } catch (error) {
                console.error("Failed to seed autonomous actions:", error);
                toast.error("Failed to seed autonomous actions");
              }
            },
          },
          {
            icon: <Bug />,
            id: "developer-tools.signals.clear",
            label: "Clear leverage actions",
            onSelect: async () => {
              try {
                const result =
                  await fetchClient.mutate.autonomousAction.clearFake({
                    organizationId,
                  });
                toast.success(`Cleared ${result.cleared} autonomous actions`);
              } catch (error) {
                console.error("Failed to clear autonomous actions:", error);
                toast.error("Failed to clear autonomous actions");
              }
            },
          },
        ]
      : [],
    icon: <Bug />,
    id: DEVELOPER_SIGNALS_PAGE_ID,
    label: "Signals (local only)",
  };

  const flagCommands: Command[] = flagsLoading
    ? [
        {
          disabled: true,
          icon: <Flag />,
          id: "developer-tools.flags.loading",
          label: "Loading feature flags...",
          onSelect: () => undefined,
        },
      ]
    : Object.values(flags)
        .toSorted((a, b) => a.flagKey.localeCompare(b.flagKey))
        .map((flag) => ({
          checked: flag.isEnabled,
          icon: <Flag />,
          id: `developer-tools.flags.${flag.flagKey}`,
          keepOpen: true,
          label: flag.flagKey,
          onSelect: () => {
            try {
              reflagClient
                .getFlag(flag.flagKey)
                .setIsEnabledOverride(!flag.isEnabled);
              loadFlags();
            } catch (error) {
              console.error(
                `Failed to toggle feature flag ${flag.flagKey}:`,
                error
              );
              toast.error("Failed to toggle feature flag");
            }
          },
        }));

  const flagsPage: CommandPage = {
    commands:
      flagCommands.length > 0
        ? flagCommands
        : [
            {
              disabled: true,
              icon: <Flag />,
              id: "developer-tools.flags.empty",
              label: "No feature flags available",
              onSelect: () => undefined,
            },
          ],
    icon: <Flag />,
    id: DEVELOPER_FLAGS_PAGE_ID,
    label: "Feature flags (local only)",
  };

  const developerToolsPage: CommandPage = {
    commands: [
      {
        icon: <Terminal />,
        id: "developer-tools.threads",
        label: "Threads...",
        pageId: DEVELOPER_THREADS_PAGE_ID,
      },
      {
        icon: <Github />,
        id: "developer-tools.github",
        label: "GitHub...",
        pageId: DEVELOPER_GITHUB_PAGE_ID,
      },
      ...(import.meta.env.DEV
        ? [
            {
              icon: <Bug />,
              id: "developer-tools.signals",
              label: "Signals...",
              pageId: DEVELOPER_SIGNALS_PAGE_ID,
            } satisfies Command,
            {
              icon: <Flag />,
              id: "developer-tools.flags",
              label: "Feature flags...",
              pageId: DEVELOPER_FLAGS_PAGE_ID,
            } satisfies Command,
          ]
        : []),
      {
        icon: <EyeOff />,
        id: "developer-tools.hide-toolbar",
        label: "Hide toolbar temporarily",
        onSelect: () => onHideToolbar("temporary"),
      },
      {
        icon: <EyeOff />,
        id: "developer-tools.hide-toolbar-section",
        label: "Hide toolbar for this section",
        onSelect: () => onHideToolbar("section"),
      },
      {
        icon: <ListRestart />,
        id: "developer-tools.live-state-log",
        label: "Open live-state log",
        onSelect: onOpenLiveStateLog,
      },
      {
        checked: reactScanEnabled,
        icon: <ScanSearch />,
        id: "developer-tools.react-scan",
        keepOpen: true,
        label: "React Scan",
        onSelect: () => setReactScanEnabled(!reactScanEnabled),
      },
    ],
    icon: <Wrench />,
    id: DEVELOPER_TOOLS_PAGE_ID,
    label: "Developer tools",
  };

  useCommandPage(
    () => threadsPage,
    [
      handleCopyLatestAgentRunData,
      handleDuplicateThread,
      handleRetriggerThreadRead,
      rawThreadParam,
    ]
  );
  useCommandPage(
    () => githubPrPage,
    [eligiblePullRequests, invokeGithubAction]
  );
  useCommandPage(
    () => githubBackfillPage,
    [
      githubRepos,
      selectedRepositories,
      selectedRepositorySet,
      invokeGithubAction,
    ]
  );
  useCommandPage(() => githubPage, []);
  useCommandPage(() => signalsPage, [organizationId]);
  useCommandPage(() => flagsPage, [flags, flagsLoading, loadFlags]);
  useCommandPage(
    () => developerToolsPage,
    [onHideToolbar, onOpenLiveStateLog, reactScanEnabled]
  );

  useCommand(
    () => ({
      group: "Developer",
      icon: <Wrench />,
      id: "developer-tools.open",
      keywords: ["devtools", "developer", "command k"],
      label: "Developer tools...",
      pageId: DEVELOPER_TOOLS_PAGE_ID,
    }),
    []
  );

  return (
    <CreateThreadDialog
      open={createThreadOpen}
      onOpenChange={setCreateThreadOpen}
    />
  );
};
