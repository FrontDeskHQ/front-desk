import { useLiveQuery } from "@live-state/sync/client";
import { useForm, useStore } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  type OrganizationSettings,
  organizationSettingsSchema,
  safeParseOrgSettings,
} from "@workspace/schemas/organization";
import { Avatar, AvatarUpload } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import {
  type BaseItem,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@workspace/ui/components/combobox";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import { useAtomValue } from "jotai/react";
import { useMemo } from "react";
import { z } from "zod";
import { activeOrganizationAtom } from "~/lib/atoms";
import { mutate, query } from "~/lib/live-state";
import { uploadFile } from "~/lib/server-funcs/upload-file";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/app/_workspace/settings/organization/")({
  component: RouteComponent,
  head: () => {
    return {
      meta: [
        ...seo({
          title: "Organization Settings - FrontDesk",
          description: "Manage your organization settings",
        }),
      ],
    };
  },
});

// TODO: Unify reserved slugs list - extract to shared constant
const reservedSlugs = [
  "support",
  "help",
  "status",
  "api",
  "admin",
  "www",
  "app",
  "dashboard",
  "login",
  "signup",
  "register",
  "account",
  "settings",
  "billing",
  "docs",
  "documentation",
  "blog",
  "about",
  "contact",
  "privacy",
  "terms",
  "legal",
];

const timezoneItems: BaseItem[] = Intl.supportedValuesOf("timeZone").map(
  (tz) => ({
    value: tz,
    label: tz.replace(/_/g, " "),
  }),
);

const digestFormSchema = z.object({
  pendingReplyThresholdMinutes: z
    .number()
    .int()
    .min(5, "Minimum is 5 minutes")
    .max(1440, "Maximum is 1440 minutes"),
  digestTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be a valid time"),
  slackChannelName: z.string().optional(),
});

const orgProfileSchema = z.object({
  orgName: z.string(),
  orgTimezone: z.string(),
  orgSlug: z
    .string()
    .min(4, "Must be at least 4 characters")
    .regex(/^[a-z-]+$/, {
      message: "Must contain only lowercase letters and dashes",
    })
    .refine((slug) => !reservedSlugs.includes(slug.toLowerCase()), {
      message: "This slug is reserved and cannot be used",
    }),
  orgLogo: z.instanceof(File).optional(),
  orgSocials: z
    .string()
    .optional()
    .refine(
      (url) => {
        if (!url || url.trim() === "") return true;
        // Match discord.gg, discord.com/invite, or discordapp.com/invite URLs (with or without protocol and www)
        return /^https:\/\/(discord\.gg|discord\.com\/invite)\/[a-zA-Z0-9]+$/.test(
          url,
        );
      },
      {
        message:
          "Must be a valid Discord invite link (e.g., discord.gg/servername)",
      },
    ),
});

function RouteComponent() {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const org = useLiveQuery(query.organization.first({ id: currentOrg?.id }));
  //TODO: Find a better way to do this since its gonna be used in other places
  const { user } = Route.useRouteContext();
  const isUserOwner =
    useLiveQuery(
      query.organizationUser.first({
        organizationId: currentOrg?.id,
        userId: user.id,
      }),
    )?.role === "owner";

  if (!org || !currentOrg) return null;

  return (
    <div className="p-4 flex flex-col gap-8 w-full">
      <OrgProfileForm
        org={org}
        currentOrg={currentOrg}
        isUserOwner={isUserOwner}
      />
      <DigestSettingsForm
        org={org}
        currentOrg={currentOrg}
        isUserOwner={isUserOwner}
      />
    </div>
  );
}

interface OrgFormProps {
  org: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    socials: string | null;
    settings: OrganizationSettings | null;
  };
  currentOrg: { id: string; logoUrl: string | null };
  isUserOwner: boolean;
}

function OrgProfileForm({ org, currentOrg, isUserOwner }: OrgFormProps) {
  const settings = useMemo(
    () => safeParseOrgSettings(org?.settings),
    [org?.settings],
  );

  const { Field, handleSubmit, store } = useForm({
    defaultValues: {
      orgName: org?.name ?? "",
      orgTimezone: settings.timezone,
      orgSlug: org?.slug ?? "",
      orgLogo: undefined,
      orgSocials: (() => {
        try {
          return JSON.parse(org?.socials ?? "{}")?.discord ?? "";
        } catch {
          return "";
        }
      })(),
    } as z.infer<typeof orgProfileSchema>,
    validators: {
      onSubmit: orgProfileSchema,
    },
    onSubmit: async ({ value }) => {
      if (!currentOrg?.id) return;

      let logoUrl = currentOrg.logoUrl;

      if (value.orgLogo) {
        const formData = new FormData();

        formData.set("file", value.orgLogo);
        formData.set("path", `organizations-logos`);

        logoUrl = await uploadFile({ data: formData });
      }

      const nextSettings = organizationSettingsSchema.parse({
        ...settings,
        timezone: value.orgTimezone,
      });

      mutate.organization.update(currentOrg.id, {
        name: value.orgName,
        slug: value.orgSlug,
        logoUrl,
        socials: JSON.stringify({ discord: value.orgSocials }),
        settings: nextSettings,
      });
    },
  });

  const nonPersistentIsDirty = useStore(store, (s) => {
    return Object.values(s.fieldMeta).some((field) => !field?.isDefaultValue);
  });

  return (
    <form
      className="flex flex-col gap-4 w-full"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      autoComplete="off"
    >
      <h2 className="text-base">Organization</h2>
      <Card className="bg-[#27272A]/30">
        <CardContent>
          <Field name="orgLogo">
            {(field) => (
              <FormItem field={field} className="flex justify-between">
                <FormLabel>Logo</FormLabel>
                <FormControl>
                  {isUserOwner ? (
                    <AvatarUpload
                      variant="org"
                      size="xl"
                      src={org?.logoUrl}
                      fallback={org?.name || "Unknown Organization"}
                      onFileChange={(file) => field.setValue(file)}
                    />
                  ) : (
                    <Avatar
                      variant="org"
                      size="xl"
                      src={org?.logoUrl}
                      fallback={org?.name || "Unknown Organization"}
                    />
                  )}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          </Field>
          <Field name="orgName">
            {(field) => (
              <FormItem field={field} className="flex justify-between">
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    onChange={(e) => field.setValue(e.target.value)}
                    autoComplete="off"
                    className="w-full max-w-3xs"
                    disabled={!isUserOwner}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          </Field>
          <Field name="orgSlug">
            {(field) => (
              <FormItem field={field} className="flex justify-between">
                <FormLabel>URL</FormLabel>
                <div className="flex flex-col w-full max-w-3xs">
                  <FormControl>
                    <label
                      htmlFor={field.name}
                      className="relative after:left-[calc(100%-var(--spacing)*32-5px)] after:pl-1 after:text-muted-foreground after:absolute after:content-['.tryfrontdesk.app'] after:top-1/2 after:-translate-y-[calc(50%-1px)] "
                    >
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => field.setValue(e.target.value)}
                        autoComplete="off"
                        className="relative pr-32"
                        disabled={!isUserOwner}
                      />
                    </label>
                  </FormControl>
                  <FormMessage className="px-2" />
                </div>
              </FormItem>
            )}
          </Field>
          <Field name="orgSocials">
            {(field) => (
              <FormItem field={field} className="flex justify-between">
                <FormLabel>Discord URL</FormLabel>
                <div className="flex flex-col w-full max-w-3xs">
                  <FormControl>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onChange={(e) => field.setValue(e.target.value)}
                      autoComplete="off"
                      className="w-full max-w-3xs"
                      disabled={!isUserOwner}
                    />
                  </FormControl>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          </Field>
          <Field name="orgTimezone">
            {(field) => (
              <FormItem field={field} className="flex justify-between">
                <FormLabel>Timezone</FormLabel>
                <FormControl>
                  <Combobox
                    items={timezoneItems}
                    value={field.state.value}
                    onValueChange={(value) => {
                      if (value) field.setValue(value);
                    }}
                    disabled={!isUserOwner}
                  >
                    <ComboboxTrigger className="w-full max-w-3xs" />
                    <ComboboxContent>
                      <ComboboxInput placeholder="Search timezone..." />
                      <ComboboxEmpty>No timezone found.</ComboboxEmpty>
                      <ComboboxList>
                        {(item: BaseItem) => (
                          <ComboboxItem key={item.value} value={item.value}>
                            {item.label}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
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

function DigestSettingsForm({ org, currentOrg, isUserOwner }: OrgFormProps) {
  const settings = useMemo(
    () => safeParseOrgSettings(org?.settings),
    [org?.settings],
  );

  const slackIntegration = useLiveQuery(
    query.integration.first({ organizationId: currentOrg?.id, type: "slack" }),
  );
  const hasSlack = !!slackIntegration?.enabled;

  const { Field, handleSubmit, store } = useForm({
    defaultValues: {
      pendingReplyThresholdMinutes:
        settings.digest.pendingReplyThresholdMinutes,
      digestTime: settings.digest.time,
      slackChannelName: settings.digest.slackChannelName ?? "",
    } as z.infer<typeof digestFormSchema>,
    validators: {
      onSubmit: digestFormSchema,
    },
    onSubmit: ({ value }) => {
      if (!currentOrg?.id) return;

      const channelName = value.slackChannelName?.trim() || null;

      const nextSettings = organizationSettingsSchema.parse({
        ...settings,
        digest: {
          ...settings.digest,
          pendingReplyThresholdMinutes: value.pendingReplyThresholdMinutes,
          time: value.digestTime,
          slackChannelId: channelName,
          slackChannelName: channelName,
        },
      });

      mutate.organization.update(currentOrg.id, {
        settings: nextSettings,
      });
    },
  });

  const nonPersistentIsDirty = useStore(store, (s) => {
    return Object.values(s.fieldMeta).some((field) => !field?.isDefaultValue);
  });

  return (
    <form
      className="flex flex-col gap-4 w-full"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      autoComplete="off"
    >
      <h2 className="text-base">Digest</h2>
      <Card className="bg-[#27272A]/30">
        <CardContent>
          <Field name="pendingReplyThresholdMinutes">
            {(field) => (
              <FormItem field={field} className="flex justify-between">
                <FormLabel>Pending reply threshold (minutes)</FormLabel>
                <div className="flex flex-col w-full max-w-3xs">
                  <FormControl>
                    <Input
                      id={field.name}
                      type="number"
                      min={5}
                      max={1440}
                      value={field.state.value}
                      onChange={(e) => field.setValue(Number(e.target.value))}
                      autoComplete="off"
                      className="w-full max-w-3xs"
                      disabled={!isUserOwner}
                    />
                  </FormControl>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          </Field>
          <Field name="digestTime">
            {(field) => (
              <FormItem field={field} className="flex justify-between">
                <FormLabel>Daily digest time</FormLabel>
                <div className="flex flex-col w-full max-w-3xs">
                  <FormControl>
                    <Input
                      id={field.name}
                      type="time"
                      value={field.state.value}
                      onChange={(e) => field.setValue(e.target.value)}
                      autoComplete="off"
                      className="w-full max-w-3xs"
                      disabled={!isUserOwner}
                    />
                  </FormControl>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          </Field>
          <Field name="slackChannelName">
            {(field) => (
              <FormItem field={field} className="flex justify-between">
                <FormLabel>Slack channel</FormLabel>
                <div className="flex flex-col w-full max-w-3xs">
                  <FormControl>
                    {hasSlack ? (
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => field.setValue(e.target.value)}
                        placeholder="#channel-name"
                        autoComplete="off"
                        className="w-full max-w-3xs"
                        disabled={!isUserOwner}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          disabled
                          placeholder="No Slack integration"
                          className="w-full max-w-3xs"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          render={
                            <Link to="/app/settings/organization/integration/slack">
                              Connect Slack
                            </Link>
                          }
                        />
                      </div>
                    )}
                  </FormControl>
                  <FormMessage />
                </div>
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
