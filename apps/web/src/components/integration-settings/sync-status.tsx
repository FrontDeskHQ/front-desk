import { Card, CardContent } from "@workspace/ui/components/card";

export function SyncStatus({
  backfill,
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
                {backfill.limit !== null && ` (limit: ${backfill.limit})`}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
