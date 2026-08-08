import { useLiveQuery } from "@live-state/sync/client";
import { useForm, useStore } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { safeParseOrgSettings } from "@workspace/schemas/organization";
import {
  AUTO_CAPABLE_ACTIONS,
  getDefaultActionAutonomy,
} from "@workspace/schemas/signals";
import type { ActionKind, AutonomyLevel } from "@workspace/schemas/signals";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import {
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@workspace/ui/components/segmented-control";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { useAtomValue } from "jotai/react";
import { useMemo, useState } from "react";
import { z } from "zod";

import { activeOrganizationAtom } from "~/lib/atoms";
import { mutate, query } from "~/lib/live-state";
import { seo } from "~/utils/seo";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/support-intelligence"
)({
  component: RouteComponent,
  head: () => ({
    meta: [
      ...seo({
        title: "Support Intelligence Settings - FrontDesk",
        description: "Configure your Support Intelligence Agent",
      }),
    ],
  }),
});

const formSchema = z.object({
  customInstructions: z.string(),
});

function RouteComponent() {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const org = useLiveQuery(query.organization.first({ id: currentOrg?.id }));

  const { user } = Route.useRouteContext();
  const isUserOwner =
    useLiveQuery(
      query.organizationUser.first({
        organizationId: currentOrg?.id,
        userId: user.id,
      })
    )?.role === "owner";

  const { Field, handleSubmit, store } = useForm({
    defaultValues: {
      customInstructions: org?.customInstructions ?? "",
    } as z.infer<typeof formSchema>,
    onSubmit: async ({ value }) => {
      if (!currentOrg?.id) return;

      mutate.organization.updateSettings({
        organizationId: currentOrg.id,
        customInstructions: value.customInstructions || null,
      });
    },
    validators: {
      onSubmit: formSchema,
    },
  });

  const nonPersistentIsDirty = useStore(store, (s) =>
    Object.values(s.fieldMeta).some((field) => !field?.isDefaultValue)
  );

  if (!org) {
    return null;
  }

  return (
    <div className="p-4 flex flex-col gap-8 w-full">
      <form
        className="flex flex-col gap-4 w-full"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        autoComplete="off"
      >
        <h2 className="text-base">Agent</h2>
        <Card className="bg-[#27272A]/30">
          <CardContent>
            <Field name="customInstructions">
              {(field) => (
                <FormItem field={field} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <FormLabel>Custom instructions</FormLabel>
                    <FormDescription>
                      Added to the Agent's system prompt for every thread. Use
                      this to set tone, escalation rules, or product-specific
                      guidance.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Textarea
                      id={field.name}
                      value={field.state.value}
                      onChange={(e) => field.setValue(e.target.value)}
                      placeholder="e.g., Always recommend checking the FAQ before escalating. Use a friendly, casual tone."
                      rows={6}
                      disabled={!isUserOwner}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            </Field>
          </CardContent>
        </Card>
        {isUserOwner && (
          <div className="flex justify-end">
            <Button disabled={!nonPersistentIsDirty} type="submit">
              Save
            </Button>
          </div>
        )}
      </form>

      <AutomationCard
        organizationId={currentOrg?.id}
        settings={org.settings}
        isUserOwner={isUserOwner}
      />
    </div>
  );
}

const HIDDEN_ACTION_KINDS: ReadonlySet<ActionKind> = new Set();

const AUTONOMY_LEVELS: AutonomyLevel[] = ["off", "suggest", "auto"];

// Mode-neutral labels for the autonomy settings, keyed on the new Action
// vocabulary (synthesis-track + inline-track).
const AUTONOMY_ACTION_LABEL: Record<ActionKind, string> = {
  apply_label: "Thread labeling",
  close: "Closing threads",
  create_issue: "Filing issues",
  link_issue: "Issue linking",
  link_pr: "PR linking",
  mark_duplicate: "Duplicate threads",
  reply: "Reply drafting",
  set_status: "Status changes",
};

/** Extra caveats shown under a row whose consequences aren't self-evident. */
const AUTONOMY_ACTION_HELP: Partial<Record<ActionKind, string>> = {
  create_issue:
    "Filing an issue can't be undone, and the issue may be visible to anyone who can see the repository. Requires a connected issue tracker (and defaults to the first target when none is pinned).",
};

/**
 * Mode-neutral autonomy settings for Support Intelligence signals.
 */
function AutomationCard({
  organizationId,
  settings,
  isUserOwner,
}: {
  organizationId: string | undefined;
  settings: unknown;
  isUserOwner: boolean;
}) {
  const initial = useMemo(() => {
    const parsed = safeParseOrgSettings(settings);
    return { ...getDefaultActionAutonomy(), ...parsed.actionAutonomy };
  }, [settings]);

  const [pending, setPending] = useState<
    Partial<Record<ActionKind, AutonomyLevel>>
  >({});

  const visibleTypes = (Object.keys(initial) as ActionKind[]).filter(
    (k) => !HIDDEN_ACTION_KINDS.has(k)
  );

  const dirty = Object.keys(pending).length > 0;

  const handleChange = (actionKind: ActionKind, level: AutonomyLevel) => {
    setPending((prev) => {
      const next = { ...prev };
      if (initial[actionKind] === level) {
        const { [actionKind]: _removed, ...rest } = next;
        return rest;
      }
      next[actionKind] = level;
      return next;
    });
  };

  const handleSave = () => {
    if (!organizationId) {
      return;
    }
    for (const [actionKind, level] of Object.entries(pending) as [
      ActionKind,
      AutonomyLevel,
    ][]) {
      mutate.organization.setActionAutonomy({
        actionKind,
        level,
        organizationId,
      });
    }
    setPending({});
  };

  const valueFor = (k: ActionKind): AutonomyLevel => pending[k] ?? initial[k];

  return (
    <div className="flex flex-col gap-4 w-full">
      <h2 className="text-base">Automation</h2>
      <Card className="bg-[#27272A]/30">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Signal autonomy</span>
            <span className="text-sm text-muted-foreground">
              Choose the level of autonomy Support Intelligence has when
              handling each signal.
            </span>
          </div>
          <div
            className="grid items-center gap-y-2 gap-x-4 text-sm"
            style={{ gridTemplateColumns: "1fr auto" }}
          >
            {visibleTypes.map((t) => {
              // Not `!REVERSIBLE_ACTIONS.has(t)`: create_issue is
              // non-reversible but still offers the full ladder (auto mode has
              // a deterministic destination in the default issue target).
              const locked = !AUTO_CAPABLE_ACTIONS.has(t);
              const current = valueFor(t);
              const help = AUTONOMY_ACTION_HELP[t];
              return (
                <div key={t} className="contents">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-foreground">
                      {AUTONOMY_ACTION_LABEL[t]}
                    </span>
                    {help ? (
                      <span className="text-xs text-muted-foreground">
                        {help}
                      </span>
                    ) : null}
                  </div>
                  <SegmentedControl
                    value={current}
                    onValueChange={(next) => {
                      if (next === "auto" && locked) {
                        return;
                      }
                      handleChange(t, next as AutonomyLevel);
                    }}
                    disabled={!isUserOwner}
                  >
                    {AUTONOMY_LEVELS.map((lvl) => {
                      const lockedAuto = lvl === "auto" && locked;
                      const item = (
                        <SegmentedControlItem
                          key={lvl}
                          value={lvl}
                          // aria-disabled (not disabled) on the locked auto
                          // segment so it still fires pointer events and the
                          // tooltip can open. Base UI Tooltip won't show on a
                          // truly-disabled element.
                          disabled={!isUserOwner && !lockedAuto}
                          aria-disabled={lockedAuto || undefined}
                          aria-label={`${AUTONOMY_ACTION_LABEL[t]} ${lvl}`}
                          className="capitalize aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                        >
                          {lvl}
                        </SegmentedControlItem>
                      );
                      if (lockedAuto) {
                        return (
                          <Tooltip key={lvl}>
                            <TooltipTrigger render={item} />
                            <TooltipContent>
                              Destructive or customer-facing — locked to Suggest
                              at most.
                            </TooltipContent>
                          </Tooltip>
                        );
                      }
                      return item;
                    })}
                  </SegmentedControl>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      {isUserOwner && (
        <div className="flex justify-end">
          <Button type="button" disabled={!dirty} onClick={handleSave}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
