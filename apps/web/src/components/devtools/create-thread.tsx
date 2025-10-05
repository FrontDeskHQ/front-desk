import { useForm } from "@tanstack/react-form";
import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import { useAtomValue } from "jotai/react";
import { ulid } from "ulid";
import { z } from "zod";
import { activeOrganizationAtom } from "~/lib/atoms";
import { mutate } from "~/lib/live-state";

const createThreadSchema = z.object({
  title: z.string(),
  author: z.string(),
});

export const CreateThread = () => {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const { Field, handleSubmit } = useForm({
    defaultValues: {
      title: "",
      author: "",
    },
    validators: {
      onSubmit: createThreadSchema,
    },
    onSubmit: async ({ value }) => {
      const authorId = ulid().toLowerCase();

      mutate.author.insert({
        id: authorId,
        name: value.author,
      });

      // TODO: Remove this timeout after new live-state version release
      setTimeout(() => {}, 300);

      mutate.thread.insert({
        id: ulid().toLowerCase(),
        name: value.title,
        authorId: authorId,
        organizationId: currentOrg?.id,
        createdAt: new Date(),
      });
    },
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          New Thread
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Thread</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="space-y-4"
        >
          <Field name="title">
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
          <Field name="author">
            {(field) => (
              <FormItem field={field} className="flex justify-between">
                <FormLabel>Author</FormLabel>
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
          <Button type="submit" className="w-full">
            Create Thread
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
