import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";

const docsLinks = {
  discord: "/docs/integrations/discord",
  slack: "/docs/integrations/slack",
} as const;

export function SyncStatus({
  backfill,
  integrationType,
}: {
  backfill:
    | {
        processed: number;
        total: number;
        limit: number | null;
        channelsDiscovering: number;
      }
    | null
    | undefined;
  integrationType: "discord" | "slack";
}) {
  const isSyncing = !!backfill;
  const isDiscovering = isSyncing && backfill.channelsDiscovering > 0;

  return (
    <Card className="bg-muted/30">
      <CardContent>
        <div className="flex gap-8 items-center justify-between">
          <div>Sync status</div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2 text-sm">
              {isSyncing ? (
                <>
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-yellow-500" />
                  </span>
                  <span>
                    {isDiscovering ? "Discovering threads..." : "Syncing"}
                  </span>
                </>
              ) : (
                <>
                  <span className="inline-flex size-2 rounded-full bg-green-500" />
                  <span>Synced</span>
                </>
              )}
            </div>
            {isSyncing && !isDiscovering && (
              <div className="text-muted-foreground text-xs">
                {backfill.processed}/{backfill.total} threads synced
              </div>
            )}
          </div>
        </div>
        {isSyncing && !isDiscovering && backfill.limit !== null && (
          <div className="mt-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-400">
            Trial plan: importing up to {backfill.limit} threads. New threads remain unlimited.{" "}
            <Button
              variant="link"
              externalLink
              render={
                <a
                  href={docsLinks[integrationType]}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Learn more
                </a>
              }
              className="p-0! h-auto!"
            >
              Learn more
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
