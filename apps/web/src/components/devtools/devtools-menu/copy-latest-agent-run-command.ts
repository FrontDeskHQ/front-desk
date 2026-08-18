"use client";

import { toast } from "sonner";

import { fetchClient } from "~/lib/live-state";

import { resolveThreadUlid } from "./thread-route-for-devtools";

const parseStoredJson = (value: string | null): unknown => {
  if (value === null) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

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

    const output = {
      attempts: result.attempts.map(({ metadataStr, ...attempt }) => ({
        ...attempt,
        metadata: parseStoredJson(metadataStr),
      })),
      events: result.events.map(({ payloadStr, ...event }) => ({
        ...event,
        payload: parseStoredJson(payloadStr),
      })),
      run: {
        ...result.run,
        metadata: parseStoredJson(result.run.metadataStr),
      },
    };

    await navigator.clipboard.writeText(JSON.stringify(output, null, 2));
    toast.success("Latest Agent run data copied");
  } catch (error) {
    console.error("Failed to copy latest Agent run data:", error);
    toast.error("Failed to copy latest Agent run data");
  }
};
