"use client";

import { MenuItem } from "@workspace/ui/components/menu";
import { useAtomValue } from "jotai/react";
import { toast } from "sonner";

import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient } from "~/lib/live-state";

// Dev-only: webhooks aren't wired up locally, so the externalEntity mirror never
// fills in. This manually enqueues a backfill for every connected repo.
const SyncGithubMenuItem = () => {
  const currentOrg = useAtomValue(activeOrganizationAtom);

  const handleSync = async () => {
    if (!currentOrg?.id) {
      toast.error("No organization selected");
      return;
    }

    try {
      const result = await fetchClient.mutate.externalEntity.syncFromGithub({
        organizationId: currentOrg.id,
      });
      toast.success(
        `Queued backfill for ${result.enqueued}/${result.repos} repositor${
          result.repos === 1 ? "y" : "ies"
        }`
      );
    } catch (error) {
      console.error("[GitHub] Manual sync failed:", error);
      toast.error("Failed to start sync");
    }
  };

  return (
    <MenuItem
      onClick={handleSync}
      aria-label="Backfill the GitHub issue/PR mirror without webhooks"
    >
      Sync issues & PRs
    </MenuItem>
  );
};

export const GithubSubmenu = () => <SyncGithubMenuItem />;
