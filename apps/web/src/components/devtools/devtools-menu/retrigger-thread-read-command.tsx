"use client";

import { MenuItem } from "@workspace/ui/components/menu";
import { useAtomValue } from "jotai/react";
import { toast } from "sonner";

import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient } from "~/lib/live-state";

import {
  resolveThreadUlid,
  useThreadRouteRawParam,
} from "./thread-route-for-devtools";

export const retriggerThreadReadFromParam = async ({
  activeOrganizationId,
  rawParam,
}: {
  activeOrganizationId?: string;
  rawParam: string | null;
}): Promise<void> => {
  if (!rawParam) {
    toast.error("Open a thread first to retrigger its read");
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

    const result = await fetchClient.mutate.thread.retriggerRead({
      organizationId: activeOrganizationId,
      threadId,
    });

    if (result.disposition === "skipped") {
      const reason =
        result.reason === "worker_disabled"
          ? "worker jobs are disabled"
          : result.reason === "queue_unavailable"
            ? "the queue is unavailable"
            : "the queue rejected it";
      toast.error(`Could not retrigger thread read: ${reason}`);
      return;
    }

    const outcome =
      result.disposition === "scheduled"
        ? "scheduled"
        : result.disposition === "coalesced"
          ? "joined the pending job"
          : "buffered for recovery";
    toast.success(`Thread read ${outcome}`);
  } catch (error) {
    console.error("Failed to retrigger thread read:", error);
    toast.error("Failed to retrigger thread read");
  }
};

export const RetriggerThreadReadMenuItem = () => {
  const currentOrganization = useAtomValue(activeOrganizationAtom);
  const rawParam = useThreadRouteRawParam();

  return (
    <MenuItem
      aria-label="Retrigger the current thread read"
      disabled={!rawParam}
      onClick={() =>
        void retriggerThreadReadFromParam({
          activeOrganizationId: currentOrganization?.id,
          rawParam,
        })
      }
    >
      Retrigger thread read
    </MenuItem>
  );
};
