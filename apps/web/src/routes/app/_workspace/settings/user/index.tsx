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
import { z } from "zod";
import { mutate, query } from "~/lib/live-state";
import { uploadFile } from "~/lib/server-funcs/upload-file";
import { seo } from "~/utils/seo";

export const Route = createFileRoute("/app/_workspace/settings/user/")({
  component: RouteComponent,
  head: () => {
    return {
      meta: [
        ...seo({
          title: "User Settings - FrontDesk",
          description: "Manage your user profile settings",
        }),
      ],
    };
  },
});

const userProfileSchema = z.object({
  userName: z.string(),
  userEmail: z.string(),
  userImage: z.instanceof(File).optional(),
});

function RouteComponent() {
  const { user: userFromContext } = Route.useRouteContext();
  const user = useLiveQuery(query.user.first({ id: userFromContext?.id }));

  const { Field, handleSubmit, store } = useForm({
    defaultValues: {
      userImage: undefined,
      userName: user?.name ?? "",
      userEmail: user?.email ?? "",
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
        formData.set("path", `users/${user.id}/avatar`);

        imageUrl = await uploadFile({ data: formData });
      }

      mutate.user.update(user.id, {
        name: value.userName,
        email: value.userEmail,
        image: imageUrl,
      });
    },
  });

  const nonPersistentIsDirty = useStore(store, (s) => {
    return Object.values(s.fieldMeta).some((field) => !field.isDefaultValue);
  });

  if (!user) return null;

  return (
    <form
      className="p-4 flex flex-col gap-4 w-full"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      autoComplete="off"
    >
      <h2 className="text-base">Profile</h2>
      <Card className="bg-[#27272A]/30">
        <CardContent>
          <Field name="userImage">
            {(field) => (
              <FormItem field={field} className="flex justify-between">
                <FormLabel>Profile picture</FormLabel>
                <FormControl>
                  <AvatarUpload
                    variant="user"
                    size="xl"
                    src={user?.image}
                    fallback={user?.name || "Unknown User"}
                    onFileChange={(file) => field.setValue(file)}
                  />
                </FormControl>
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
                    disabled
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
        <Button disabled={!nonPersistentIsDirty}>Save</Button>
      </div>
    </form>
  );
}
