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
import { Upload } from "lucide-react";
import { z } from "zod";
import { mutate } from "~/lib/live-state";
import { uploadFile } from "~/lib/server-funcs/upload-file";

export const Route = createFileRoute("/app/_workspace/settings/user/")({
  component: RouteComponent,
});

const userProfileSchema = z.object({
  userName: z.string(),
  userEmail: z.string(),
  userImage: z.instanceof(File).optional(),
});

function RouteComponent() {
  const { user } = Route.useRouteContext();

  const { Field, handleSubmit, store } = useForm({
    defaultValues: {
      userName: user?.name ?? "",
      userImage: undefined,
    } as z.infer<typeof userProfileSchema>,
    validators: {
      onSubmit: userProfileSchema,
    },
    onSubmit: async ({ value }) => {
      if (!user?.id) return;

      let imageUrl = user.image;

      if (value.userImage) {
        const formData = new FormData();

        formData.set("file", value.userImage);

        imageUrl = await uploadFile({ data: formData });
      }

      mutate.user.update(user.id, {
        name: value.userName,
        email: value.userEmail,
        image: imageUrl,
      });
    },
  });

  const isDirty = useStore(store, (s) => s.isDirty);

  if (!user) return null;

  return (
    <form
      className="flex flex-col gap-4 max-w-4xl mx-auto w-full"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      autoComplete="off"
    >
      <h2 className="text-base">Profile</h2>
      <Card className="bg-[#27272A]/30">
        <CardContent>
          <Field name="userName">
            {(field) => (
              <FormItem field={field} className="flex justify-between">
                <FormLabel>Profile picture</FormLabel>
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
                            : (user?.image ?? "none"),
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
          <Field name="userEmail">
            {(field) => (
              <FormItem field={field} className="flex justify-between">
                <FormLabel>Email</FormLabel>
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
          <Field name="userName">
            {(field) => (
              <FormItem field={field} className="flex justify-between">
                <FormLabel>Full name</FormLabel>
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
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button disabled={!isDirty}>Save</Button>
      </div>
    </form>
  );
}
