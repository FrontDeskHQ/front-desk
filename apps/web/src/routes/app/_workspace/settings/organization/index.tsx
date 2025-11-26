import { useLiveQuery } from "@live-state/sync/client";
import { useForm, useStore } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { AvatarUpload } from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import { useAtomValue } from "jotai/react";
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

const orgProfileSchema = z.object({
  orgName: z.string(),
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

  const { Field, handleSubmit, store } = useForm({
    defaultValues: {
      orgName: org?.name ?? "",
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

      mutate.organization.update(currentOrg.id, {
        name: value.orgName,
        slug: value.orgSlug,
        logoUrl,
        socials: JSON.stringify({ discord: value.orgSocials }),
      });
    },
  });

  const nonPersistentIsDirty = useStore(store, (s) => {
    return Object.values(s.fieldMeta).some((field) => !field.isDefaultValue);
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
      <h2 className="text-base">Organization</h2>
      <Card className="bg-[#27272A]/30">
        <CardContent>
          <Field name="orgLogo">
            {(field) => (
              <FormItem field={field} className="flex justify-between">
                <FormLabel>Logo</FormLabel>
                <FormControl>
                  <AvatarUpload
                    variant="org"
                    size="xl"
                    src={org?.logoUrl}
                    fallback={org?.name || "Unknown Organization"}
                    onFileChange={(file) => field.setValue(file)}
                  />
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
                    />
                  </FormControl>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          </Field>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button disabled={!nonPersistentIsDirty}>Save</Button>
      </div>
    </form>
  );
}
