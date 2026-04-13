"use client";

import { useParams } from "@tanstack/react-router";
import { MenuItem } from "@workspace/ui/components/menu";
import { useAtomValue } from "jotai/react";
import { toast } from "sonner";
import { ulid } from "ulid";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient } from "~/lib/live-state";

const AddPendingReplyMenuItem = () => {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const params = useParams({ strict: false });
  const threadId = (params as { id?: string } | undefined)?.id ?? null;

  const handleAdd = async () => {
    if (!threadId) {
      toast.error("Open a thread first");
      return;
    }

    if (!currentOrg?.id) {
      toast.error("No organization selected");
      return;
    }

    try {
      const now = new Date();
      const lastMessageAt = new Date(
        now.getTime() - (45 + Math.floor(Math.random() * 180)) * 60_000,
      );

      await fetchClient.mutate.suggestion.insert({
        id: ulid().toLowerCase(),
        type: "digest:pending_reply",
        entityId: threadId,
        relatedEntityId: null,
        organizationId: currentOrg.id,
        active: true,
        accepted: false,
        resultsStr: JSON.stringify({
          detectedAt: now.toISOString(),
          lastMessageAt: lastMessageAt.toISOString(),
          thresholdMinutes: 30,
        }),
        metadataStr: JSON.stringify({ digestIncludedAt: [] }),
        createdAt: now,
        updatedAt: now,
      });

      toast.success("Pending reply signal added");
    } catch (err) {
      console.error("Failed to add pending reply signal:", err);
      toast.error("Failed to add pending reply signal");
    }
  };

  return (
    <MenuItem
      onClick={handleAdd}
      aria-label="Add a fake pending-reply digest signal for the current thread"
    >
      Add "Waiting for reply"
    </MenuItem>
  );
};

const AddLoopToCloseMenuItem = () => {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const params = useParams({ strict: false });
  const threadId = (params as { id?: string } | undefined)?.id ?? null;

  const handleAdd = async () => {
    if (!threadId) {
      toast.error("Open a thread first");
      return;
    }

    if (!currentOrg?.id) {
      toast.error("No organization selected");
      return;
    }

    try {
      const now = new Date();
      const prMergedAt = new Date(
        now.getTime() - (2 + Math.floor(Math.random() * 24)) * 3600_000,
      );

      await fetchClient.mutate.suggestion.insert({
        id: ulid().toLowerCase(),
        type: "digest:loop_to_close",
        entityId: threadId,
        relatedEntityId: null,
        organizationId: currentOrg.id,
        active: true,
        accepted: false,
        resultsStr: JSON.stringify({
          detectedAt: now.toISOString(),
          linkedPrId: "github:acme/app#142",
          prMergedAt: prMergedAt.toISOString(),
        }),
        metadataStr: JSON.stringify({ digestIncludedAt: [] }),
        createdAt: now,
        updatedAt: now,
      });

      toast.success("Loop to close signal added");
    } catch (err) {
      console.error("Failed to add loop to close signal:", err);
      toast.error("Failed to add loop to close signal");
    }
  };

  return (
    <MenuItem
      onClick={handleAdd}
      aria-label="Add a fake loop-to-close digest signal for the current thread"
    >
      Add "Loop to close"
    </MenuItem>
  );
};

export const SignalsSubmenu = () => {
  return (
    <>
      <AddPendingReplyMenuItem />
      <AddLoopToCloseMenuItem />
    </>
  );
};
