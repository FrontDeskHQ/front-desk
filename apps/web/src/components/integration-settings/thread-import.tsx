import { useMutation } from "@tanstack/react-query";
import type { ThreadImportStatus } from "@workspace/schemas/integration/shared";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { getErrorMessage } from "api/errors";
import { toast } from "sonner";

import { fetchClient } from "~/lib/live-state";

const pluralThreads = (count: number) =>
  `${count} ${count === 1 ? "thread" : "threads"}`;

const describe = (
  status: ThreadImportStatus | null
): { label: string; detail?: string; running: boolean } => {
  if (!status) {
    return { label: "Not started", running: false };
  }
  switch (status.state) {
    case "finding": {
      return { label: "Finding threads", running: true };
    }
    case "importing": {
      return {
        // The run can't know how many eligible threads exist without reading
        // all of history, so M is the most it can import (the allowance).
        label:
          status.total === null
            ? `Importing ${status.imported}`
            : `Importing ${status.imported} of up to ${status.total}`,
        running: true,
      };
    }
    case "done": {
      if (status.exhausted) {
        return {
          detail: `${pluralThreads(status.imported)} imported${status.failed > 0 ? `, ${status.failed} failed` : ""}. Your plan's import allowance is used up.`,
          label: "Allowance exhausted",
          running: false,
        };
      }
      if (status.failed > 0) {
        return {
          detail: `${pluralThreads(status.imported)} imported, ${status.failed} failed. Import again to retry.`,
          label: "Partial result",
          running: false,
        };
      }
      if (status.imported === 0) {
        return {
          detail: "New threads will still come in as they happen.",
          label: "No eligible threads found",
          running: false,
        };
      }
      return {
        label: `${pluralThreads(status.imported)} imported`,
        running: false,
      };
    }
    default: {
      const unknown: never = status;
      throw new Error(`Unknown import state: ${JSON.stringify(unknown)}`);
    }
  }
};

/**
 * "Import threads" for a support integration: brings in the newest threads
 * from the selected support channels, up to the plan's import allowance.
 * Selecting channels alone never imports history.
 */
export function ThreadImport({
  canImport,
  integrationId,
  status,
}: {
  /** False until at least one support channel is selected. */
  canImport: boolean;
  integrationId: string;
  status: ThreadImportStatus | null;
}) {
  const { label, detail, running } = describe(status);
  const importMutation = useMutation({
    mutationFn: () =>
      fetchClient.mutate.integration.importThreads({ integrationId }),
    onError: (error) => {
      toast.error(getErrorMessage(error, "Couldn't start the import."));
    },
    onSuccess: ({ outcome }) => {
      if (outcome === "running") {
        toast.info("An import is already running.");
      }
    },
  });

  return (
    <Card className="bg-muted/30">
      <CardContent>
        <div className="flex gap-8 items-center justify-between">
          <div className="flex flex-col">
            <div>Import threads</div>
            <div className="text-muted-foreground">
              Bring in recent threads from your support channels
            </div>
          </div>
          <Button
            variant="outline"
            // Not gated on `running`: a stale status must never lock the
            // action. The server coalesces a click onto a live import.
            disabled={!canImport || importMutation.isPending}
            onClick={() => importMutation.mutate()}
          >
            Import threads
          </Button>
        </div>
        <div className="mt-3 flex flex-col gap-1 text-sm">
          <div className="flex items-center gap-2">
            {running ? (
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-yellow-500" />
              </span>
            ) : null}
            <span>{label}</span>
          </div>
          {detail ? (
            <div className="text-muted-foreground text-xs">{detail}</div>
          ) : null}
          {canImport ? null : (
            <div className="text-muted-foreground text-xs">
              Select a support channel to import its threads.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
