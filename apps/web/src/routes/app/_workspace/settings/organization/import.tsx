import { useLiveQuery } from "@live-state/sync/client";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { threadImportAllowance } from "@workspace/schemas/integration/shared";
import { selectedSupportChannels } from "@workspace/schemas/integration/support-channels";
import { organizationSettingsSchema } from "@workspace/schemas/organization";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { TreeItem, TreeItemRow, TreeList } from "@workspace/ui/components/tree";
import { getErrorMessage } from "api/errors";
import { formatDistanceToNow } from "date-fns";
import { useAtomValue } from "jotai/react";
import { Hash, Info, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { describeThreadImport } from "~/components/integration-settings/thread-import";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient, query } from "~/lib/live-state";
import { seo } from "~/utils/seo";

import { requireIntegrationOption } from "./integration";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/import"
)({
  component: RouteComponent,
  head: () => ({
    meta: seo({ title: "Import threads - Settings - FrontDesk" }),
  }),
  staticData: {
    breadcrumb: "Import threads",
  },
});

/** Support connectors that implement "Import threads". */
const IMPORT_SOURCES = new Set(["slack", "discord"]);

interface ImportSource {
  integrationId: string;
  type: string;
  channels: { id: string; name: string }[];
}

function RouteComponent() {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { organizationUsers } = Route.useRouteContext();
  const isOwner =
    organizationUsers?.some(
      (orgUser) =>
        orgUser.organizationId === currentOrg?.id && orgUser.role === "owner"
    ) ?? false;

  // All of the org's integrations, so runs from a since-disabled one keep
  // their source icon; only enabled ones can start a new import.
  const integrations = useLiveQuery(
    query.integration.where({ organizationId: currentOrg?.id })
  );
  const runs = useLiveQuery(
    query.threadImportRun
      .where({ organizationId: currentOrg?.id })
      .orderBy("createdAt", "desc")
  );

  const sources = useMemo<ImportSource[]>(
    () =>
      (integrations ?? [])
        .filter((i) => i.enabled && IMPORT_SOURCES.has(i.type))
        .map((i) => ({
          channels: selectedSupportChannels(i.type, i.configStr) ?? [],
          integrationId: i.id,
          type: i.type,
        })),
    [integrations]
  );
  const typeByIntegration = useMemo(
    () => new Map((integrations ?? []).map((i) => [i.id, i.type])),
    [integrations]
  );

  const plan = organizationSettingsSchema.shape.plan.safeParse(
    currentOrg?.settings?.plan
  ).data;
  const allowance = threadImportAllowance(plan);

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex justify-between items-start gap-8">
        <div className="flex flex-col gap-1">
          <h2 className="text-base">Import threads</h2>
          <p className="text-muted-foreground text-sm">
            Bring in past threads from your support channels. New threads sync
            on their own; importing is only for history.
          </p>
        </div>
        <Button
          disabled={!isOwner || sources.length === 0}
          onClick={() => setDialogOpen(true)}
        >
          <Plus /> New import
        </Button>
      </div>

      {sources.length === 0 ? (
        <Card className="bg-muted/30">
          <CardContent className="text-sm text-muted-foreground">
            Connect Slack or Discord in{" "}
            <Link
              className="underline"
              to="/app/settings/organization/integration"
            >
              Integrations
            </Link>{" "}
            to import threads.
          </CardContent>
        </Card>
      ) : null}

      <div className="text-sm text-muted-foreground">Recent imports</div>
      <Card className="bg-muted/30">
        <CardContent className="flex flex-col divide-y">
          {(runs ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground py-2">
              No imports yet.
            </div>
          ) : (
            (runs ?? []).map((run) => {
              const type = typeByIntegration.get(run.integrationId);
              const { label, detail, running } = describeThreadImport(
                run.status
              );
              return (
                <div className="flex items-center gap-3 py-2.5" key={run.id}>
                  {type ? <SourceIcon type={type} /> : null}
                  <span className="flex-1 truncate">
                    {run.channels.map((c) => `#${c.name}`).join(", ")}
                  </span>
                  <output
                    aria-live="polite"
                    className="flex flex-col items-end text-sm"
                  >
                    <span className="flex items-center gap-2">
                      {running ? <RunningDot /> : null}
                      {label}
                    </span>
                    {detail ? (
                      <span className="text-muted-foreground text-xs">
                        {detail}
                      </span>
                    ) : null}
                  </output>
                  <span className="text-muted-foreground text-xs w-24 text-right">
                    {formatDistanceToNow(run.createdAt, { addSuffix: true })}
                  </span>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <NewImportDialog
        allowance={allowance}
        onOpenChange={setDialogOpen}
        open={dialogOpen}
        sources={sources}
      />
    </div>
  );
}

/** The integration's logo without its brand-coloured tile, in text colour. */
function SourceIcon({ type }: { type: string }) {
  return (
    <span className="flex size-3.5 shrink-0 items-center justify-center [&>div]:size-auto [&>div]:rounded-none [&>div]:bg-transparent [&_path]:fill-foreground [&_svg]:size-3.5 [&_svg]:fill-foreground">
      {requireIntegrationOption(type).icon}
    </span>
  );
}

/** What every import does, shown under the channel picker. */
function ImportNotice({ allowance }: { allowance: number | null }) {
  return (
    <div className="flex gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
      <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <ul className="flex flex-col gap-1 text-muted-foreground">
        <li>Newest threads come in first.</li>
        <li>Threads already in FrontDesk are skipped.</li>
        {allowance === null ? null : (
          <li>
            Your plan imports up to{" "}
            <span className="text-foreground">{allowance} threads</span> in
            total.
          </li>
        )}
      </ul>
    </div>
  );
}

function RunningDot() {
  return (
    <span className="relative flex size-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-yellow-500" />
    </span>
  );
}

/** Picked channels, keyed by integration. */
type Selection = Map<string, Set<string>>;

function NewImportDialog({
  allowance,
  onOpenChange,
  open,
  sources,
}: {
  allowance: number | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sources: ImportSource[];
}) {
  const [selection, setSelection] = useState<Selection>(new Map());

  const close = () => {
    onOpenChange(false);
    setSelection(new Map());
  };

  // What is ticked among the current support channels, not the raw selection: a channel deselected
  // elsewhere meanwhile drops out here, and so out of the request.
  const chosen = sources
    .map((source) => ({
      channels: source.channels.filter((c) =>
        selection.get(source.integrationId)?.has(c.id)
      ),
      source,
    }))
    .filter(({ channels }) => channels.length > 0);

  const importMutation = useMutation({
    // One run per source: a run imports from a single integration.
    mutationFn: () =>
      Promise.allSettled(
        chosen.map(({ source, channels }) =>
          fetchClient.mutate.integration.importThreads({
            channelIds: channels.map((c) => c.id),
            integrationId: source.integrationId,
          })
        )
      ),
    onSuccess: (results) => {
      const failure = results.find((r) => r.status === "rejected");
      if (failure) {
        toast.error(
          getErrorMessage(failure.reason, "Couldn't start the import.")
        );
      }
      if (
        results.some(
          (r) => r.status === "fulfilled" && r.value.outcome === "running"
        )
      ) {
        toast.info(
          "An import from this source is already running. Try again when it finishes."
        );
      }
      if (!failure) {
        close();
      }
    },
  });

  const setChannels = (
    integrationId: string,
    update: (ids: Set<string>) => void
  ) =>
    setSelection((current) => {
      const next = new Map(current);
      const ids = new Set(current.get(integrationId));
      update(ids);
      next.set(integrationId, ids);
      return next;
    });

  const channelCount = chosen.reduce((n, c) => n + c.channels.length, 0);

  return (
    <Dialog
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      open={open}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New import</DialogTitle>
          <DialogDescription>
            Choose the support channels to bring past threads in from.
          </DialogDescription>
        </DialogHeader>

        {
          // One root per source: siblings at the root would draw a guide
          // line through the earlier sources' channels.
          <div className="flex flex-col gap-2">
            {sources.map((source) => {
              const option = requireIntegrationOption(source.type);
              const picked = selection.get(source.integrationId);
              const pickedCount = source.channels.filter((c) =>
                picked?.has(c.id)
              ).length;
              const all =
                source.channels.length > 0 &&
                pickedCount === source.channels.length;
              return (
                <TreeList key={source.integrationId}>
                  <TreeItem>
                    <TreeItemRow>
                      <label className="flex flex-1 items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={
                            all
                              ? true
                              : pickedCount > 0
                                ? "indeterminate"
                                : false
                          }
                          disabled={source.channels.length === 0}
                          onCheckedChange={() =>
                            setChannels(source.integrationId, (ids) => {
                              ids.clear();
                              if (!all) {
                                for (const c of source.channels) {
                                  ids.add(c.id);
                                }
                              }
                            })
                          }
                        />
                        <SourceIcon type={source.type} />
                        <span>{option.label}</span>
                      </label>
                    </TreeItemRow>
                    {source.channels.length === 0 ? (
                      <TreeList>
                        <TreeItem>
                          <TreeItemRow>
                            <span className="text-muted-foreground">
                              No support channels selected.{" "}
                              <Link
                                className="underline"
                                to="/app/settings/organization/integration"
                              >
                                Choose some
                              </Link>{" "}
                              first.
                            </span>
                          </TreeItemRow>
                        </TreeItem>
                      </TreeList>
                    ) : (
                      <TreeList>
                        {source.channels.map((c) => (
                          <TreeItem key={c.id}>
                            <TreeItemRow>
                              <label className="flex flex-1 items-center gap-2 cursor-pointer">
                                <Checkbox
                                  checked={picked?.has(c.id) ?? false}
                                  onCheckedChange={() =>
                                    setChannels(source.integrationId, (ids) => {
                                      if (ids.has(c.id)) {
                                        ids.delete(c.id);
                                      } else {
                                        ids.add(c.id);
                                      }
                                    })
                                  }
                                />
                                <Hash className="size-3.5 shrink-0 text-muted-foreground" />
                                <span>{c.name}</span>
                              </label>
                            </TreeItemRow>
                          </TreeItem>
                        ))}
                      </TreeList>
                    )}
                  </TreeItem>
                </TreeList>
              );
            })}
          </div>
        }

        <ImportNotice allowance={allowance} />

        <DialogFooter>
          <Button onClick={close} variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={chosen.length === 0 || importMutation.isPending}
            onClick={() => importMutation.mutate()}
          >
            {channelCount === 0
              ? "Start import"
              : `Import from ${channelCount} ${channelCount === 1 ? "channel" : "channels"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
