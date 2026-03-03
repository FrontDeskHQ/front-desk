import { useLiveQuery } from "@live-state/sync/client";
import { useForm, useStore } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
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
import { useAtomValue } from "jotai/react";
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
          description: "Configure your Support Intelligence agent",
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
    <form
      className="p-4 flex flex-col gap-4 w-full"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      autoComplete="off"
    >
      <h2 className="text-base">Support Intelligence</h2>
      <Card className="bg-[#27272A]/30">
        <CardContent>
          <Field name="customInstructions">
            {(field) => (
              <FormItem field={field} className="flex flex-col gap-2">
                <FormLabel>Custom instructions</FormLabel>
                <FormDescription>
                  Provide custom instructions for the Support Intelligence
                  agent. These will be included in the agent's system prompt
                  when assisting with support threads.
                </FormDescription>
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
  );
}
