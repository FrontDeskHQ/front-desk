import { useLiveQuery } from "@live-state/sync/client";
import { useForm, useStore } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { safeParseOrgSettings } from "@workspace/schemas/organization";
import {
  type AutonomyLevel,
  getDefaultSignalAutonomy,
  LOCKED_SIGNAL_TYPES,
  SIGNAL_LABEL,
  type SignalType,
} from "@workspace/schemas/signals";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import {
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
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
  "/app/_workspace/settings/organization/support-intelligence",
)({
  component: RouteComponent,
  head: () => {
    return {
      meta: [
        ...seo({
          title: "Support Intelligence Settings - FrontDesk",
          description: "Configure your Support Intelligence Agent",
        }),
      ],
    };
  },
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
      }),
    )?.role === "owner";

  const { Field, handleSubmit, store } = useForm({
    defaultValues: {
      customInstructions: org?.customInstructions ?? "",
    } as z.infer<typeof formSchema>,
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: async ({ value }) => {
      if (!currentOrg?.id) return;

      mutate.organization.update(currentOrg.id, {
        customInstructions: value.customInstructions || null,
      });
    },
  });

  const nonPersistentIsDirty = useStore(store, (s) => {
    return Object.values(s.fieldMeta).some((field) => !field?.isDefaultValue);
  });

  if (!org) return null;

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

// Pattern signals (M3) are intentionally hidden until their detectors ship.
const HIDDEN_SIGNAL_TYPES: readonly SignalType[] = [
  "churn_risk",
  "kb_gap",
  "trending_issue",
];

const AUTONOMY_LEVELS: AutonomyLevel[] = ["off", "suggest", "auto"];

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
    return { ...getDefaultSignalAutonomy(), ...(parsed.signalAutonomy ?? {}) };
  }, [settings]);

  const [pending, setPending] = useState<
    Partial<Record<SignalType, AutonomyLevel>>
  >({});

  const visibleTypes = (Object.keys(initial) as SignalType[]).filter(
    (t) => !HIDDEN_SIGNAL_TYPES.includes(t),
  );

  const dirty = Object.keys(pending).length > 0;

  const handleChange = (signalType: SignalType, level: AutonomyLevel) => {
    setPending((prev) => {
      const next = { ...prev };
      if (initial[signalType] === level) {
        delete next[signalType];
      } else {
        next[signalType] = level;
      }
      return next;
    });
  };

  const handleSave = () => {
    if (!organizationId) return;
    for (const [signalType, level] of Object.entries(pending) as [
      SignalType,
      AutonomyLevel,
    ][]) {
      mutate.organization.setSignalAutonomy({
        organizationId,
        signalType,
        level,
      });
    }
    setPending({});
  };

  const valueFor = (t: SignalType): AutonomyLevel => pending[t] ?? initial[t];

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
            role="table"
            aria-label="Signal autonomy"
          >
            {visibleTypes.map((t) => {
              const locked = LOCKED_SIGNAL_TYPES.includes(t);
              const current = valueFor(t);
              return (
                <div key={t} className="contents">
                  <div className="text-foreground">{SIGNAL_LABEL[t]}</div>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={current}
                    onValueChange={(v) => {
                      if (!v) return;
                      handleChange(t, v as AutonomyLevel);
                    }}
                    disabled={!isUserOwner}
                  >
                    {AUTONOMY_LEVELS.map((lvl) => {
                      const disabled =
                        !isUserOwner || (lvl === "auto" && locked);
                      const item = (
                        <ToggleGroupItem
                          key={lvl}
                          value={lvl}
                          disabled={disabled}
                          aria-label={`${SIGNAL_LABEL[t]} ${lvl}`}
                          className="capitalize px-4 flex-none min-w-fit"
                        >
                          {lvl}
                        </ToggleGroupItem>
                      );
                      if (lvl === "auto" && locked) {
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
                  </ToggleGroup>
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
