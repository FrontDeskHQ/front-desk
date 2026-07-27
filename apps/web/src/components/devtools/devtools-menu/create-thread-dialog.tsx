"use client";

import { useForm } from "@tanstack/react-form";
import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { useAtomValue } from "jotai/react";
import { toast } from "sonner";
import { z } from "zod";

import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient } from "~/lib/live-state";

const devtoolsAuthorId = (organizationId: string, name: string) =>
  `devtools-${organizationId}-${name.trim().toLowerCase().replaceAll(/\s+/g, "-")}`;

const createDevThread = async ({
  organizationId,
  title,
  authorName,
  message,
}: {
  organizationId: string;
  title: string;
  authorName: string;
  message: string;
}) => {
  await fetchClient.mutate.thread.create({
    author: {
      id: devtoolsAuthorId(organizationId, authorName),
      name: authorName,
    },
    message,
    organizationId,
    title,
  });
};

const SAMPLE_THREADS = [
  {
    author: "Sarah Johnson",
    message:
      "Hi, I've been trying to login for the past hour but keep getting an 'Invalid credentials' error. I'm sure my password is correct. Can someone help me access my account?",
    title: "Unable to login to my account",
  },
  {
    author: "Michael Chen",
    message:
      "I tried to upgrade my subscription but the payment failed. However, I can see the charge on my credit card statement. This is very concerning. Please investigate this issue immediately.",
    title: "Payment failed but money was deducted",
  },
  {
    author: "Emma Wilson",
    message:
      "I forgot my password and need to reset it. I clicked on 'Forgot Password' but haven't received any email. Could you guide me through the password reset process?",
    title: "How to reset my password?",
  },
  {
    author: "James Rodriguez",
    message:
      "Would love to see a dark mode option in the app. I use it mostly at night and the bright interface strains my eyes. This would be a great addition for many users!",
    title: "Feature request: Dark mode support",
  },
  {
    author: "Lisa Anderson",
    message:
      "Every time I try to access my dashboard, I get a 404 error. This started happening after the latest update. Is this a known issue?",
    title: "Getting 404 error on dashboard",
  },
  {
    author: "David Kim",
    message:
      "I've been trying to cancel my subscription but the cancel button doesn't work. I've clicked it multiple times but nothing happens. How can I cancel my subscription?",
    title: "Subscription cancellation issue",
  },
  {
    author: "Anna Martinez",
    message:
      "The data export feature seems to be broken. I click the export button, but nothing downloads. I need to export my data for a report by tomorrow. Please help!",
    title: "Data export not working",
  },
  {
    author: "Robert Taylor",
    message:
      "The mobile app crashes every time I try to open it. I'm using iOS 17 on iPhone 14. This is making it impossible to use the service on mobile.",
    title: "Mobile app keeps crashing",
  },
  {
    author: "Maria Garcia",
    message:
      "I need to download my invoices for tax purposes, but all the download links return a 500 error. Could you please fix this or send me the invoices directly?",
    title: "Invoice download link broken",
  },
  {
    author: "Kevin Brown",
    message:
      "I'm trying to upload a presentation file that's about 8MB, but the system won't let me. The limit seems too restrictive. Is there a way to increase this limit?",
    title: "Cannot upload files larger than 5MB",
  },
  {
    author: "Jessica Lee",
    message:
      "I signed up 2 days ago but still haven't received the verification email. I've checked my spam folder. Can you resend it or manually verify my account?",
    title: "Account verification email not received",
  },
  {
    author: "Thomas White",
    message:
      "We set up the Slack integration last week, but notifications stopped syncing yesterday. Our team relies on these notifications. Can you look into this?",
    title: "Integration with Slack not syncing",
  },
  {
    author: "Amanda Clark",
    message:
      "We're interested in upgrading to the enterprise plan. Could you provide more details about the pricing for 50+ users and what additional features are included?",
    title: "Billing question about enterprise plan",
  },
  {
    author: "Christopher Davis",
    message:
      "Our application is hitting the API rate limit constantly. We're a paying customer and need higher limits to maintain our service. Can we discuss increasing our rate limit?",
    title: "API rate limit too restrictive",
  },
  {
    author: "Rachel Green",
    message:
      "I changed one of our team member's permissions from viewer to editor, but they still can't edit anything. I've tried updating it several times. What's wrong?",
    title: "Team member permissions not updating",
  },
  {
    author: "Daniel Miller",
    message:
      "I'm not receiving any email notifications even though I have them enabled in my settings. I've missed several important updates because of this. Please help!",
    title: "Notifications not being sent",
  },
  {
    author: "Olivia Moore",
    message:
      "I'd like to request a refund for my annual subscription. The service doesn't meet our needs and we're switching to another platform. What's the refund process?",
    title: "Request for refund",
  },
  {
    author: "William Harris",
    message:
      "I received an alert about a login attempt from an unfamiliar location in Russia. I've changed my password, but I'm concerned my account may have been compromised. Can you investigate?",
    title: "Security concern: Suspicious login attempt",
  },
  {
    author: "Sophia Martin",
    message:
      "We're migrating from our old system and need to import about 10,000 records. What's the best way to do this bulk import? Do you provide migration assistance?",
    title: "Data migration from old system",
  },
  {
    author: "Matthew Thompson",
    message:
      "The platform becomes very slow when working with our larger datasets (100k+ rows). Page loads take over 30 seconds. Are there any optimizations we can implement?",
    title: "Performance issues with large datasets",
  },
];

const createRandomThreadsSchema = z.object({
  count: z.number().min(1).max(100),
});

const createSingleThreadSchema = z.object({
  author: z.string().min(1, "Author is required"),
  title: z.string().min(1, "Title is required"),
});

interface CreateThreadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateThreadDialog = ({
  open,
  onOpenChange,
}: CreateThreadDialogProps) => {
  const currentOrg = useAtomValue(activeOrganizationAtom);

  const randomForm = useForm({
    defaultValues: {
      count: 5,
    },
    onSubmit: async ({ value }) => {
      if (!currentOrg?.id) return;

      try {
        for (let i = 0; i < value.count; i++) {
          const randomThread =
            SAMPLE_THREADS[Math.floor(Math.random() * SAMPLE_THREADS.length)] ??
            SAMPLE_THREADS[0];
          if (!randomThread) return;
          await createDevThread({
            organizationId: currentOrg.id,
            title: randomThread.title,
            authorName: randomThread.author,
            message: randomThread.message,
          });
        }

        toast.success(
          value.count === 1
            ? "Created 1 thread"
            : `Created ${value.count} threads`
        );
        randomForm.reset();
        onOpenChange(false);
      } catch (error) {
        console.error("Failed to create threads:", error);
        toast.error("Failed to create threads");
      }
    },
    validators: {
      onSubmit: createRandomThreadsSchema,
    },
  });

  const singleForm = useForm({
    defaultValues: {
      author: "",
      title: "",
    },
    onSubmit: async ({ value }) => {
      if (!currentOrg?.id) return;

      try {
        await createDevThread({
          organizationId: currentOrg.id,
          title: value.title,
          authorName: value.author,
          message: "Thread created from devtools.",
        });

        toast.success("Created thread");
        singleForm.reset();
        onOpenChange(false);
      } catch (error) {
        console.error("Failed to create thread:", error);
        toast.error("Failed to create thread");
      }
    },
    validators: {
      onSubmit: createSingleThreadSchema,
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
