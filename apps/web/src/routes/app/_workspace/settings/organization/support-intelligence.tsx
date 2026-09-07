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
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { activeOrganizationAtom } from "~/lib/atoms";
import { mutate, query } from "~/lib/live-state";
import { seo } from "~/utils/seo";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/support-intelligence"
)({
  component: RouteComponent,
  staticData: {
    breadcrumb: "Support Intelligence",
  },
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

const AUTONOMY_LEVELS: AutonomyLevel[] = ["off", "suggest", "auto"];

type AutonomyCopy = {
  /** Mode-neutral row title, keyed on the Action vocabulary. */
  label: string;
  /**
   * What the action does, in one sentence and mode-neutral. What each level
   * does with it is said once, in {@link AUTONOMY_LEVEL_COPY}, so a row never
   * has to re-explain the ladder.
   */
  description: string;
  /**
   * Set on kinds outside `AUTO_CAPABLE_ACTIONS`, where `auto` is locked. Says
   * why, in the same voice as the level copy.
   */
  locked?: string;
};

/**
 * The ladder, explained once above the rows. Every per-action caveat that used
 * to live in a row is a restatement of one of these three, and the evidence
 * rule in `auto` is the honest general form of every kind's action gate.
 */
const AUTONOMY_LEVEL_COPY: Record<AutonomyLevel, string> = {
  auto: "The Agent acts on its own when it has evidence behind it. Anything less certain still arrives as a suggestion.",
  off: "The Agent leaves the action alone. Nothing is proposed and nothing runs.",
  suggest:
    "The Agent proposes the action and waits. Nothing happens until someone on your team accepts it.",
};

// "Closing threads" folded into "Status changes" with ADR 0014 — closing was
// always a status write, and it is one row now.
const AUTONOMY_COPY: Record<ActionKind, AutonomyCopy> = {
  apply_label: {
    description: "Labels a thread by topic, once, when it arrives in the inbox.",
    label: "Thread labeling",
  },
  create_issue: {
    description:
      "Files a new issue in your connected tracker and links it to the thread. Filing can't be undone.",
    label: "Filing issues",
  },
  link_issue: {
    description:
      "Points a thread at an issue FrontDesk already tracks, without posting to your tracker.",
    label: "Issue linking",
  },
  link_pr: {
    description:
      "Points a thread at a pull request and leaves a back-reference comment on it.",
    label: "PR linking",
    locked:
      "Linking writes a comment to your repository and can't be undone, so this action stops at Suggest.",
  },
  mark_duplicate: {
    description:
      "Marks a repeat thread as a duplicate of the thread already tracking it.",
    label: "Duplicate threads",
  },
  reply: {
    description: "Writes a reply to the customer in the thread's composer.",
    label: "Reply drafting",
  },
  set_status: {
    description:
      "Moves a thread between open, in progress, resolved, and closed.",
    label: "Status changes",
  },
};

/**
 * Display order, least consequential first, so the rows a team is most likely
 * to raise sit at the top and the ones that write outside FrontDesk sit at the
 * bottom. Explicit rather than `Object.keys`, which would order the rows by
 * however the defaults happen to be declared.
 */
const AUTONOMY_ORDER: ActionKind[] = [
  "apply_label",
  "set_status",
  "mark_duplicate",
  "link_issue",
  "reply",
  "create_issue",
  "link_pr",
];

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

  const visibleTypes = AUTONOMY_ORDER;

  const dirty = Object.keys(pending).length > 0;

  useEffect(() => {
    setPending((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [actionKind, level] of Object.entries(prev) as [
        ActionKind,
        AutonomyLevel,
      ][]) {
        if (initial[actionKind] === level) {
          delete next[actionKind];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [initial]);

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
    if (!organizationId || Object.keys(pending).length === 0) {
      return;
    }
    mutate.organization.setActionAutonomy({
      changes: pending,
      organizationId,
    });
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
          <div className="grid gap-3.5 sm:grid-cols-3">
            {AUTONOMY_LEVELS.map((lvl) => (
              <div
                key={lvl}
                className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-muted/30 p-3.5"
              >
                <span className="font-medium text-foreground text-xs capitalize">
                  {lvl}
                </span>
                <span className="text-muted-foreground text-xs leading-relaxed">
                  {AUTONOMY_LEVEL_COPY[lvl]}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-6">
            {visibleTypes.map((t) => {
              // Not `!REVERSIBLE_ACTIONS.has(t)`: create_issue is
              // non-reversible but still offers the full ladder (auto mode has
              // a deterministic destination in the default issue target).
              const locked = !AUTO_CAPABLE_ACTIONS.has(t);
              const current = valueFor(t);
              const copy = AUTONOMY_COPY[t];
              return (
                <div key={t} className="flex items-start justify-between gap-8">
                  <div className="flex flex-col gap-1">
                    <span className="text-foreground text-sm">
                      {copy.label}
                    </span>
                    <span className="text-muted-foreground text-xs leading-relaxed">
                      {copy.description}
                    </span>
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
                    className="shrink-0"
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
                          aria-label={`${copy.label} ${lvl}`}
                          className="capitalize aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                        >
                          {lvl}
                        </SegmentedControlItem>
                      );
                      if (lockedAuto) {
                        return (
                          <Tooltip key={lvl}>
                            <TooltipTrigger render={item} />
                            <TooltipContent className="max-w-64">
                              {copy.locked}
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
