"use client";

import { getRouteApi } from "@tanstack/react-router";
import { MenuItem } from "@workspace/ui/components/menu";
import { useAtomValue } from "jotai/react";
import { toast } from "sonner";
import { ulid } from "ulid";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient } from "~/lib/live-state";

export const AddPrSuggestionMenuItem = () => {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const { id: threadId } = (() => {
    try {
      return getRouteApi("/app/_workspace/_main/threads/$id").useParams();
    } catch {
      return { id: null };
    }
  })();

  const handleAddPrSuggestion = async () => {
    if (!threadId) {
      toast.error("Open a thread first to add a PR suggestion");
      return;
    }

    if (!currentOrg?.id) {
      toast.error("No organization selected");
      return;
    }

    try {
      const now = new Date();
      await fetchClient.mutate.suggestion.insert({
        id: ulid().toLowerCase(),
        type: "linked_pr",
        entityId: threadId,
        relatedEntityId: null,
        organizationId: currentOrg.id,
        active: true,
        accepted: false,
        resultsStr: JSON.stringify({
          prId: 123456789,
          prNumber: 142,
          prTitle: "Fix authentication timeout on session refresh",
          prUrl: "https://github.com/acme/app/pull/142",
          repo: "acme/app",
          confidence: 0.87,
          reasoning:
            "PR addresses session timeout issues mentioned in this thread",
        }),
        metadataStr: null,
        createdAt: now,
        updatedAt: now,
      });

      toast.success("PR suggestion added");
    } catch (err) {
      console.error("Failed to add PR suggestion:", err);
      toast.error("Failed to add PR suggestion");
    }
  };

  return (
    <MenuItem
      onClick={handleAddPrSuggestion}
      aria-label="Add a fake linked PR suggestion for the current thread"
    >
      Add PR suggestion
    </MenuItem>
  );
};
