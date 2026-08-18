"use client";

import { useAtomValue } from "jotai/react";
import { Clipboard, History } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useCommandPage } from "~/lib/commands/hooks";
import { commandRegistryAtom } from "~/lib/commands/registry";
import type { Command, CommandPage } from "~/lib/commands/types";
import { fetchClient } from "~/lib/live-state";

import { copyAgentRunBundle } from "./agent-run-clipboard";
import { resolveThreadUlid } from "./thread-route-for-devtools";

export const COPY_AGENT_RUN_PAGE_ID = "developer-tools.threads.agent-runs";

type AgentRunSummary = Awaited<
  ReturnType<typeof fetchClient.query.agentRun.listForThread>
>[number];

interface RunsState {
  runs: AgentRunSummary[];
  status: "idle" | "loading" | "error" | "ready";
  threadId: string | null;
}

const IDLE_STATE: RunsState = { runs: [], status: "idle", threadId: null };

const formatTimestamp = (value: Date | string): string =>
  new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    second: "2-digit",
  });

const formatRunLabel = (run: AgentRunSummary, index: number): string => {
  const suffix = run.auditIncomplete ? " · audit incomplete" : "";
  return `${index === 0 ? "latest · " : ""}${run.status} · ${formatTimestamp(run.startedAt)}${suffix}`;
};

const placeholderCommand = (id: string, label: string): Command => ({
  disabled: true,
  icon: <History />,
  id: `${COPY_AGENT_RUN_PAGE_ID}.${id}`,
  label,
  onSelect: () => undefined,
});

const copyRun = async ({
  organizationId,
  runId,
  threadId,
}: {
  organizationId: string;
  runId: string;
  threadId: string;
}): Promise<void> => {
  try {
    const bundle = await fetchClient.query.agentRun.oneForThread({
      organizationId,
      runId,
      threadId,
    });

    if (!bundle) {
      toast.error("Agent run no longer exists");
      return;
    }

    await copyAgentRunBundle(bundle, "Agent run data copied");
  } catch (error) {
    console.error("Failed to copy Agent run data:", error);
    toast.error("Failed to copy Agent run data");
  }
};

/**
 * Registers the Agent run picker page. Runs are never synced to the client, so
 * the list is fetched fresh every time the page is opened.
 */
export const useCopyAgentRunPage = ({
  organizationId,
  rawThreadParam,
}: {
  organizationId: string;
  rawThreadParam: string | null;
}) => {
  const currentPageId = useAtomValue(commandRegistryAtom).currentPageId;
  const isOpen = currentPageId === COPY_AGENT_RUN_PAGE_ID;
  const [state, setState] = useState<RunsState>(IDLE_STATE);

  useEffect(() => {
    if (!isOpen || !rawThreadParam) {
      return;
    }

    let cancelled = false;
    setState({ runs: [], status: "loading", threadId: null });

    const load = async () => {
      try {
        const threadId = await resolveThreadUlid(rawThreadParam);
        if (!threadId) {
          throw new Error("THREAD_NOT_FOUND");
        }

        const runs = await fetchClient.query.agentRun.listForThread({
          organizationId,
          threadId,
        });
        if (!cancelled) {
          setState({ runs, status: "ready", threadId });
        }
      } catch (error) {
        console.error("Failed to load Agent runs:", error);
        if (!cancelled) {
          setState({ runs: [], status: "error", threadId: null });
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [isOpen, organizationId, rawThreadParam]);

  const buildCommands = (): Command[] => {
    if (!rawThreadParam) {
      return [placeholderCommand("no-thread", "Open a thread first")];
    }
    if (state.status === "loading" || state.status === "idle") {
      return [placeholderCommand("loading", "Loading Agent runs...")];
    }
    if (state.status === "error") {
      return [placeholderCommand("error", "Failed to load Agent runs")];
    }
    if (state.runs.length === 0) {
      return [placeholderCommand("empty", "No Agent runs for this thread")];
    }

    const threadId = state.threadId;
    return state.runs.map((run, index) => ({
      icon: <Clipboard />,
      id: `${COPY_AGENT_RUN_PAGE_ID}.${run.id}`,
      keywords: ["agent", "run", run.id, run.status, run.pipelineJobId ?? ""],
      label: formatRunLabel(run, index),
      onSelect: () => {
        if (!threadId) {
          return;
        }
        void copyRun({ organizationId, runId: run.id, threadId });
      },
    }));
  };

  const page: CommandPage = {
    commands: buildCommands(),
    icon: <History />,
    id: COPY_AGENT_RUN_PAGE_ID,
    label: "Copy Agent run",
  };

  useCommandPage(() => page, [organizationId, rawThreadParam, state]);
};
