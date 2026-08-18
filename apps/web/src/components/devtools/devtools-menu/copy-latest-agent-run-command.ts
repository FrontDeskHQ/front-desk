"use client";

import { toast } from "sonner";

import { fetchClient } from "~/lib/live-state";

import { copyAgentRunBundle } from "./agent-run-clipboard";
import { resolveThreadUlid } from "./thread-route-for-devtools";

export const copyLatestAgentRunDataFromParam = async ({
  activeOrganizationId,
  rawParam,
}: {
  activeOrganizationId?: string;
  rawParam: string | null;
}): Promise<void> => {
  if (!rawParam) {
    toast.error("Open a thread first to copy its latest Agent run");
    return;
  }

  if (!activeOrganizationId) {
    toast.error("No active organization");
    return;
  }

  try {
    const threadId = await resolveThreadUlid(rawParam);
    if (!threadId) {
      toast.error("Thread not found");
      return;
    }

    const result = await fetchClient.query.agentRun.latestForThread({
      organizationId: activeOrganizationId,
      threadId,
    });

    if (!result) {
      toast.info("No Agent run record exists for this thread yet");
      return;
    }

    await copyAgentRunBundle(result, "Latest Agent run data copied");
  } catch (error) {
    console.error("Failed to copy latest Agent run data:", error);
    toast.error("Failed to copy latest Agent run data");
  }
};
