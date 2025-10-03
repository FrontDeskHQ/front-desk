import { useLiveQuery } from "@live-state/sync/client";
import { useForm, useStore } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
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
import { Upload } from "lucide-react";
import { z } from "zod";
import { activeOrganizationAtom } from "~/lib/atoms";
import { mutate, query } from "~/lib/live-state";
import { uploadFile } from "~/lib/server-funcs/upload-file";

export const Route = createFileRoute("/app/_workspace/settings/organization/")({
  component: RouteComponent,
});

const orgProfileSchema = z.object({
  orgName: z.string(),
  orgSlug: z.string().regex(/^[a-z-]+$/, {
    message: "Must contain only lowercase letters and dashes",
  }),
  orgLogo: z.instanceof(File).optional(),
});

function RouteComponent() {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const org = useLiveQuery(query.organization.first({ id: currentOrg?.id }));

  const { Field, handleSubmit, store } = useForm({
    defaultValues: {
      orgName: org?.name ?? "",
      orgSlug: org?.slug ?? "",
      orgLogo: undefined,
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
      });
    },
  });
  const isDirty = useStore(store, (s) => s.isDirty);

  if (!org) return null;

  return (
    <form
      className="flex flex-col gap-4 max-w-4xl mx-auto w-full"
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
                <div className="group relative">
                  <FormControl>
                    <Input
                      id={field.name}
                      type="file"
                      onChange={(e) =>
                        e.target.files?.[0] &&
                        field.setValue(e.target.files?.[0])
                      }
                      autoComplete="off"
                      className="size-10 text-transparent file:text-transparent peer"
                      style={{
                        backgroundImage:
                          field.state.value &&
                          typeof field.state.value !== "string"
                            ? `url(${URL.createObjectURL(field.state.value)})`
                            : (org?.logoUrl ?? "none"),
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                      aria-label="Upload organization logo"
                    />
                  </FormControl>
                  <div className="absolute inset-0 border bg-background/50 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity peer-focus-visible:opacity-100 pointer-events-none">
                    <Upload className="size-5" />
                  </div>
                </div>
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
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button disabled={!isDirty}>Save</Button>
      </div>
    </form>
  );
}
