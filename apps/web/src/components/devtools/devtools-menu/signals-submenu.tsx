"use client";

import { MenuItem } from "@workspace/ui/components/menu";
import { useAtomValue } from "jotai/react";
import { toast } from "sonner";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient } from "~/lib/live-state";

// TODO(signals-overhaul): the add-pr / pending-reply / loop-to-close / force-digest
// devtools commands targeted the dropped `suggestion` table and digest pipeline.
// Rebuild them against thread.agentRead / thread.inlineSuggestions when the new
// pipelines (issues 05/06/07/08) land.

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
      <SeedLeverageActionsMenuItem />
      <ClearLeverageActionsMenuItem />
    </>
  );
};
