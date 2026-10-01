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
import { getErrorMessage } from "api/errors";
import { formatDistanceToNow } from "date-fns";
import { useAtomValue } from "jotai/react";
import { Hash, Plus } from "lucide-react";
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
          variant="outline"
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
                  <span className="size-4 shrink-0 [&_svg]:size-4">
                    {type ? requireIntegrationOption(type).icon : null}
                  </span>
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

function RunningDot() {
  return (
    <span className="relative flex size-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-yellow-500" />
    </span>
  );
}

const STEPS = ["Source", "Channels", "Review"] as const;

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
  const [step, setStep] = useState(0);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [channelIds, setChannelIds] = useState<Set<string>>(new Set());
  const source = sources.find((s) => s.integrationId === sourceId) ?? null;

  const reset = () => {
    setStep(0);
    setSourceId(null);
    setChannelIds(new Set());
  };
  const close = () => {
    onOpenChange(false);
    reset();
  };

  const importMutation = useMutation({
    mutationFn: (input: { integrationId: string; channelIds: string[] }) =>
      fetchClient.mutate.integration.importThreads(input),
    onError: (error) => {
      toast.error(getErrorMessage(error, "Couldn't start the import."));
    },
    onSuccess: ({ outcome }) => {
      if (outcome === "running") {
        toast.info(
          "An import from this source is already running. Try again when it finishes."
        );
        return;
      }
      close();
    },
  });

  const toggleChannel = (id: string) =>
    setChannelIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const canContinue =
    (step === 0 && source !== null) || (step === 1 && channelIds.size > 0);
  const chosen = source?.channels.filter((c) => channelIds.has(c.id)) ?? [];

  return (
    <Dialog
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      open={open}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New import</DialogTitle>
          <DialogDescription className="flex gap-4">
            {STEPS.map((name, i) => (
              <span
                className={i === step ? "text-foreground" : undefined}
                key={name}
              >
                {i + 1}. {name}
              </span>
            ))}
          </DialogDescription>
        </DialogHeader>

        {step === 0 && (
          <div className="grid grid-cols-2 gap-3">
            {sources.map((s) => {
              const option = requireIntegrationOption(s.type);
              return (
                <button
                  className={`border rounded-lg p-4 text-left flex flex-col gap-1 ${sourceId === s.integrationId ? "border-primary" : ""}`}
                  key={s.integrationId}
                  onClick={() => {
                    if (s.integrationId !== sourceId) {
                      setChannelIds(new Set());
                    }
                    setSourceId(s.integrationId);
                  }}
                  type="button"
                >
                  <span className="flex items-center gap-2 [&_svg]:size-5">
                    {option.icon}
                    {option.label}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {s.channels.length}{" "}
                    {s.channels.length === 1
                      ? "support channel"
                      : "support channels"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {step === 1 && source && (
          <div className="flex flex-col">
            {source.channels.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No support channels selected.{" "}
                <Link
                  className="underline"
                  to="/app/settings/organization/integration"
                >
                  Choose some
                </Link>{" "}
                first.
              </div>
            ) : (
              source.channels.map((c) => (
                <label
                  className="flex items-center gap-3 py-2 px-1 cursor-pointer hover:bg-muted/40 rounded-md"
                  key={c.id}
                >
                  <Checkbox
                    checked={channelIds.has(c.id)}
                    onCheckedChange={() => toggleChannel(c.id)}
                  />
                  <Hash className="size-3.5 text-muted-foreground" />
                  <span>{c.name}</span>
                </label>
              ))
            )}
          </div>
        )}

        {step === 2 && source && (
          <div className="text-sm flex flex-col gap-1">
            <div>
              Import from {chosen.map((c) => `#${c.name}`).join(", ")}, newest
              threads first.
            </div>
            <div className="text-muted-foreground">
              Threads already in FrontDesk are skipped.
              {allowance === null
                ? ""
                : ` Your plan imports up to ${allowance} threads in total.`}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
            variant="ghost"
          >
            Back
          </Button>
          {step < 2 ? (
            <Button disabled={!canContinue} onClick={() => setStep(step + 1)}>
              Continue
            </Button>
          ) : (
            <Button
              disabled={
                !source || chosen.length === 0 || importMutation.isPending
              }
              onClick={() =>
                source &&
                importMutation.mutate({
                  // What the review step shows, not the raw selection: a
                  // channel deselected meanwhile has dropped out of `chosen`.
                  channelIds: chosen.map((c) => c.id),
                  integrationId: source.integrationId,
                })
              }
            >
              Start import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
