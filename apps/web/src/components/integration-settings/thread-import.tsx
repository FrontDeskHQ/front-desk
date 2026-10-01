import { Link } from "@tanstack/react-router";
import type { ThreadImportStatus } from "@workspace/schemas/integration/shared";
import { Card, CardContent } from "@workspace/ui/components/card";
import { ArrowRight } from "lucide-react";

const pluralThreads = (count: number) =>
  `${count} ${count === 1 ? "thread" : "threads"}`;

export const describeThreadImport = (
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

/** Points a support integration's settings at the Import threads page. */
export function ThreadImportLink() {
  return (
    <Card className="bg-muted/30">
      <CardContent className="flex gap-8 items-center justify-between">
        <div className="flex flex-col">
          <div>Import threads</div>
          <div className="text-muted-foreground">
            Bring in past threads from your support channels
          </div>
        </div>
        <Link
          className="flex items-center gap-1 text-sm hover:underline"
          to="/app/settings/organization/import"
        >
          Go to Import threads <ArrowRight className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
