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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { useAtomValue } from "jotai/react";
import { useState } from "react";
import { ulid } from "ulid";
import { z } from "zod";
import { activeOrganizationAtom } from "~/lib/atoms";
import { mutate } from "~/lib/live-state";

const SAMPLE_THREADS = [
  {
    title: "Unable to login to my account",
    author: "Sarah Johnson",
    message:
      "Hi, I've been trying to login for the past hour but keep getting an 'Invalid credentials' error. I'm sure my password is correct. Can someone help me access my account?",
  },
  {
    title: "Payment failed but money was deducted",
    author: "Michael Chen",
    message:
      "I tried to upgrade my subscription but the payment failed. However, I can see the charge on my credit card statement. This is very concerning. Please investigate this issue immediately.",
  },
  {
    title: "How to reset my password?",
    author: "Emma Wilson",
    message:
      "I forgot my password and need to reset it. I clicked on 'Forgot Password' but haven't received any email. Could you guide me through the password reset process?",
  },
  {
    title: "Feature request: Dark mode support",
    author: "James Rodriguez",
    message:
      "Would love to see a dark mode option in the app. I use it mostly at night and the bright interface strains my eyes. This would be a great addition for many users!",
  },
  {
    title: "Getting 404 error on dashboard",
    author: "Lisa Anderson",
    message:
      "Every time I try to access my dashboard, I get a 404 error. This started happening after the latest update. Is this a known issue?",
  },
  {
    title: "Subscription cancellation issue",
    author: "David Kim",
    message:
      "I've been trying to cancel my subscription but the cancel button doesn't work. I've clicked it multiple times but nothing happens. How can I cancel my subscription?",
  },
  {
    title: "Data export not working",
    author: "Anna Martinez",
    message:
      "The data export feature seems to be broken. I click the export button, but nothing downloads. I need to export my data for a report by tomorrow. Please help!",
  },
  {
    title: "Mobile app keeps crashing",
    author: "Robert Taylor",
    message:
      "The mobile app crashes every time I try to open it. I'm using iOS 17 on iPhone 14. This is making it impossible to use the service on mobile.",
  },
  {
    title: "Invoice download link broken",
    author: "Maria Garcia",
    message:
      "I need to download my invoices for tax purposes, but all the download links return a 500 error. Could you please fix this or send me the invoices directly?",
  },
  {
    title: "Cannot upload files larger than 5MB",
    author: "Kevin Brown",
    message:
      "I'm trying to upload a presentation file that's about 8MB, but the system won't let me. The limit seems too restrictive. Is there a way to increase this limit?",
  },
  {
    title: "Account verification email not received",
    author: "Jessica Lee",
    message:
      "I signed up 2 days ago but still haven't received the verification email. I've checked my spam folder. Can you resend it or manually verify my account?",
  },
  {
    title: "Integration with Slack not syncing",
    author: "Thomas White",
    message:
      "We set up the Slack integration last week, but notifications stopped syncing yesterday. Our team relies on these notifications. Can you look into this?",
  },
  {
    title: "Billing question about enterprise plan",
    author: "Amanda Clark",
    message:
      "We're interested in upgrading to the enterprise plan. Could you provide more details about the pricing for 50+ users and what additional features are included?",
  },
  {
    title: "API rate limit too restrictive",
    author: "Christopher Davis",
    message:
      "Our application is hitting the API rate limit constantly. We're a paying customer and need higher limits to maintain our service. Can we discuss increasing our rate limit?",
  },
  {
    title: "Team member permissions not updating",
    author: "Rachel Green",
    message:
      "I changed one of our team member's permissions from viewer to editor, but they still can't edit anything. I've tried updating it several times. What's wrong?",
  },
  {
    title: "Notifications not being sent",
    author: "Daniel Miller",
    message:
      "I'm not receiving any email notifications even though I have them enabled in my settings. I've missed several important updates because of this. Please help!",
  },
  {
    title: "Request for refund",
    author: "Olivia Moore",
    message:
      "I'd like to request a refund for my annual subscription. The service doesn't meet our needs and we're switching to another platform. What's the refund process?",
  },
  {
    title: "Security concern: Suspicious login attempt",
    author: "William Harris",
    message:
      "I received an alert about a login attempt from an unfamiliar location in Russia. I've changed my password, but I'm concerned my account may have been compromised. Can you investigate?",
  },
  {
    title: "Data migration from old system",
    author: "Sophia Martin",
    message:
      "We're migrating from our old system and need to import about 10,000 records. What's the best way to do this bulk import? Do you provide migration assistance?",
  },
  {
    title: "Performance issues with large datasets",
    author: "Matthew Thompson",
    message:
      "The platform becomes very slow when working with our larger datasets (100k+ rows). Page loads take over 30 seconds. Are there any optimizations we can implement?",
  },
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
        const randomThread =
          SAMPLE_THREADS[Math.floor(Math.random() * SAMPLE_THREADS.length)];
        const authorId = ulid().toLowerCase();
        const threadId = ulid().toLowerCase();

        mutate.author.insert({
          id: authorId,
          name: randomThread.author,
          userId: null,
          metaId: null,
          organizationId: currentOrg.id,
        });

        // Small delay to ensure author is created first
        await new Promise((resolve) => setTimeout(resolve, 100));

        mutate.thread.insert({
          id: threadId,
          name: randomThread.title,
          authorId: authorId,
          organizationId: currentOrg.id,
          createdAt: new Date(),
          deletedAt: null,
          discordChannelId: null,
          externalId: null,
          externalOrigin: null,
          externalMetadataStr: null,
          externalIssueId: null,
          assignedUserId: null,
          status: 0,
          priority: 0,
        });

        // Small delay to ensure thread is created first
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Create initial message for the thread
        mutate.message.insert({
          id: ulid().toLowerCase(),
          authorId: authorId,
          content: JSON.stringify(randomThread.message),
          threadId: threadId,
          createdAt: new Date(),
          origin: null,
          externalMessageId: null,
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
        organizationId: currentOrg.id,
      });

      // Small delay to ensure author is created first
      await new Promise((resolve) => setTimeout(resolve, 100));

      mutate.thread.insert({
        id: ulid().toLowerCase(),
        name: value.title,
        authorId: authorId,
        organizationId: currentOrg.id,
        createdAt: new Date(),
        deletedAt: null,
        discordChannelId: null,
        externalId: null,
        externalOrigin: null,
        externalMetadataStr: null,
        externalIssueId: null,
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
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        New Thread
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
