import { Card, CardContent } from "@workspace/ui/components/card";

export function SyncStatus({
  backfill,
}: {
  backfill: { processed: number; total: number } | null | undefined;
}) {
  const isSyncing = !!backfill;

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
                  <span>Syncing</span>
                </>
              ) : (
                <>
                  <span className="inline-flex size-2 rounded-full bg-green-500" />
                  <span>Synced</span>
                </>
              )}
            </div>
            {isSyncing && (
              <div className="text-muted-foreground text-xs">
                {backfill.processed}/{backfill.total} threads synced
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
