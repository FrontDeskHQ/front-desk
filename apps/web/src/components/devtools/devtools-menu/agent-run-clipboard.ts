"use client";

import { toast } from "sonner";

import { fetchClient } from "~/lib/live-state";

type AgentRunBundle = NonNullable<
  Awaited<ReturnType<typeof fetchClient.query.agentRun.latestForThread>>
>;

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

/** The stored `*Str` columns are re-inflated so the copied JSON is readable. */
export const formatAgentRunBundle = (bundle: AgentRunBundle) => {
  const { metadataStr: runMetadataStr, ...run } = bundle.run;

  return {
    attempts: bundle.attempts.map(({ metadataStr, ...attempt }) => ({
      ...attempt,
      metadata: parseStoredJson(metadataStr),
    })),
    events: bundle.events.map(({ payloadStr, ...event }) => ({
      ...event,
      payload: parseStoredJson(payloadStr),
    })),
    run: {
      ...run,
      metadata: parseStoredJson(runMetadataStr),
    },
  };
};

export const copyAgentRunBundle = async (
  bundle: AgentRunBundle,
  successMessage: string
): Promise<void> => {
  await navigator.clipboard.writeText(
    JSON.stringify(formatAgentRunBundle(bundle), null, 2)
  );
  toast.success(successMessage);
};
