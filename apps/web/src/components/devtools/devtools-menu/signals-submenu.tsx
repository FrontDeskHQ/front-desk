"use client";

import { MenuItem, MenuSeparator } from "@workspace/ui/components/menu";
import { useAtomValue } from "jotai/react";
import { toast } from "sonner";
import { ulid } from "ulid";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient } from "~/lib/live-state";
import { AddPrSuggestionMenuItem } from "./add-pr-suggestion-command";
import {
  resolveThreadUlid,
  useThreadRouteRawParam,
} from "./thread-route-for-devtools";

const AddPendingReplyMenuItem = () => {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const rawThreadParam = useThreadRouteRawParam();

  const handleAdd = async () => {
    if (!rawThreadParam) {
      toast.error("Open a thread first");
      return;
    }

    if (!currentOrg?.id) {
      toast.error("No organization selected");
      return;
    }

    const threadId = await resolveThreadUlid(rawThreadParam);
    if (!threadId) {
      toast.error("Could not resolve thread");
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
  const rawThreadParam = useThreadRouteRawParam();

  const handleAdd = async () => {
    if (!rawThreadParam) {
      toast.error("Open a thread first");
      return;
    }

    if (!currentOrg?.id) {
      toast.error("No organization selected");
      return;
    }

    const threadId = await resolveThreadUlid(rawThreadParam);
    if (!threadId) {
      toast.error("Could not resolve thread");
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

const ForceDigestMenuItem = () => {
  const currentOrg = useAtomValue(activeOrganizationAtom);

  const handleForce = async () => {
    if (!currentOrg?.id) {
      toast.error("No organization selected");
      return;
    }

    try {
      const res = await fetch("/api/dev/force-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: currentOrg.id }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      toast.success(`Digest job enqueued: ${data.jobId}`);
    } catch (err) {
      console.error("Failed to force digest:", err);
      toast.error("Failed to force digest");
    }
  };

  return (
    <MenuItem
      onClick={handleForce}
      aria-label="Force send the daily digest for the current organization"
    >
      Force send digest
    </MenuItem>
  );
};

const SeedLeverageActionsMenuItem = () => {
  const currentOrg = useAtomValue(activeOrganizationAtom);

  const handleSeed = async () => {
    if (!currentOrg?.id) {
      toast.error("No organization selected");
      return;
    }

    try {
      const res = await fetchClient.mutate.autonomousAction.seedFake({
        organizationId: currentOrg.id,
        count: 8,
      });
      toast.success(`Seeded ${res.inserted} autonomous actions`);
    } catch (err) {
      console.error("Failed to seed autonomous actions:", err);
      toast.error("Failed to seed autonomous actions");
    }
  };

  return (
    <MenuItem
      onClick={handleSeed}
      aria-label="Seed fake autonomous actions for the leverage report"
    >
      Seed leverage actions
    </MenuItem>
  );
};

const ClearLeverageActionsMenuItem = () => {
  const currentOrg = useAtomValue(activeOrganizationAtom);

  const handleClear = async () => {
    if (!currentOrg?.id) {
      toast.error("No organization selected");
      return;
    }

    try {
      const res = await fetchClient.mutate.autonomousAction.clearFake({
        organizationId: currentOrg.id,
      });
      toast.success(`Cleared ${res.cleared} autonomous actions`);
    } catch (err) {
      console.error("Failed to clear autonomous actions:", err);
      toast.error("Failed to clear autonomous actions");
    }
  };

  return (
    <MenuItem
      onClick={handleClear}
      aria-label="Clear all autonomous actions for the current organization"
    >
      Clear leverage actions
    </MenuItem>
  );
};

export const SignalsSubmenu = () => {
  return (
    <>
      <AddPrSuggestionMenuItem />
      <AddPendingReplyMenuItem />
      <AddLoopToCloseMenuItem />
      <MenuSeparator />
      <SeedLeverageActionsMenuItem />
      <ClearLeverageActionsMenuItem />
      <ForceDigestMenuItem />
    </>
  );
};
