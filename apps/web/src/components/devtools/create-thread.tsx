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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { useAtomValue } from "jotai/react";
import { useState } from "react";
import { ulid } from "ulid";
import { z } from "zod";
import { activeOrganizationAtom } from "~/lib/atoms";
import { mutate } from "~/lib/live-state";

const SAMPLE_THREADS = [
  { title: "Unable to login to my account", author: "Sarah Johnson" },
  { title: "Payment failed but money was deducted", author: "Michael Chen" },
  { title: "How to reset my password?", author: "Emma Wilson" },
  { title: "Feature request: Dark mode support", author: "James Rodriguez" },
  { title: "Getting 404 error on dashboard", author: "Lisa Anderson" },
  { title: "Subscription cancellation issue", author: "David Kim" },
  { title: "Data export not working", author: "Anna Martinez" },
  { title: "Mobile app keeps crashing", author: "Robert Taylor" },
  { title: "Invoice download link broken", author: "Maria Garcia" },
  { title: "Cannot upload files larger than 5MB", author: "Kevin Brown" },
  { title: "Account verification email not received", author: "Jessica Lee" },
  { title: "Integration with Slack not syncing", author: "Thomas White" },
  { title: "Billing question about enterprise plan", author: "Amanda Clark" },
  { title: "API rate limit too restrictive", author: "Christopher Davis" },
  { title: "Team member permissions not updating", author: "Rachel Green" },
  { title: "Notifications not being sent", author: "Daniel Miller" },
  { title: "Request for refund", author: "Olivia Moore" },
  { title: "Security concern: Suspicious login attempt", author: "William Harris" },
  { title: "Data migration from old system", author: "Sophia Martin" },
  { title: "Performance issues with large datasets", author: "Matthew Thompson" },
];

const createRandomThreadsSchema = z.object({
  count: z.number().min(1).max(100),
});

const createSingleThreadSchema = z.object({
  title: z.string().min(1, "Title is required"),
  author: z.string().min(1, "Author is required"),
});

export const CreateThread = () => {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const [isOpen, setIsOpen] = useState(false);
  
  const randomForm = useForm({
    defaultValues: {
      count: 5,
    },
    validators: {
      onSubmit: createRandomThreadsSchema,
    },
    onSubmit: async ({ value }) => {
      if (!currentOrg?.id) return;

      // Generate random threads
      for (let i = 0; i < value.count; i++) {
        const randomThread = SAMPLE_THREADS[Math.floor(Math.random() * SAMPLE_THREADS.length)];
        const authorId = ulid().toLowerCase();

        mutate.author.insert({
          id: authorId,
          name: randomThread.author,
          userId: null,
          metaId: null,
        });

        // Small delay to ensure author is created first
        await new Promise((resolve) => setTimeout(resolve, 100));

        mutate.thread.insert({
          id: ulid().toLowerCase(),
          name: randomThread.title,
          authorId: authorId,
          organizationId: currentOrg.id,
          createdAt: new Date(),
          discordChannelId: null,
          assignedUserId: null,
          status: 0,
          priority: 0,
        });
      }

      randomForm.reset();
      setIsOpen(false);
    },
  });

  const singleForm = useForm({
    defaultValues: {
      title: "",
      author: "",
    },
    validators: {
      onSubmit: createSingleThreadSchema,
    },
    onSubmit: async ({ value }) => {
      if (!currentOrg?.id) return;

      const authorId = ulid().toLowerCase();

      mutate.author.insert({
        id: authorId,
        name: value.author,
        userId: null,
        metaId: null,
      });

      // Small delay to ensure author is created first
      await new Promise((resolve) => setTimeout(resolve, 100));

      mutate.thread.insert({
        id: ulid().toLowerCase(),
        name: value.title,
        authorId: authorId,
        organizationId: currentOrg.id,
        createdAt: new Date(),
        discordChannelId: null,
        assignedUserId: null,
        status: 0,
        priority: 0,
      });

      singleForm.reset();
      setIsOpen(false);
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          New Thread
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Thread</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="single" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="single">Single</TabsTrigger>
            <TabsTrigger value="random">Random</TabsTrigger>
          </TabsList>
          
          <TabsContent value="single">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                singleForm.handleSubmit();
              }}
              className="space-y-4"
            >
              <singleForm.Field name="title">
                {(field) => (
                  <FormItem field={field} className="flex justify-between">
                    <FormLabel>Title</FormLabel>
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
              </singleForm.Field>
              <singleForm.Field name="author">
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
              </singleForm.Field>
              <Button type="submit" className="w-full">
                Create Thread
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="random">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                randomForm.handleSubmit();
              }}
              className="space-y-4"
            >
              <randomForm.Field name="count">
                {(field) => (
                  <FormItem field={field} className="flex justify-between">
                    <FormLabel>Number of Threads</FormLabel>
                    <FormControl>
                      <Input
                        id={field.name}
                        type="number"
                        min={1}
                        max={100}
                        value={field.state.value}
                        onChange={(e) => field.setValue(Number(e.target.value))}
                        autoComplete="off"
                        className="w-full max-w-3xs"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              </randomForm.Field>
              <Button type="submit" className="w-full">
                Generate Threads
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
