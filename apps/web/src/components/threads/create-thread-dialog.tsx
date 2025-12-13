import { useRouter } from "@tanstack/react-router";
import {
  Editor,
  EditorInput,
  type JSONContent,
} from "@workspace/ui/components/blocks/tiptap";
import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { MessageSquarePlus, X } from "lucide-react";
import { useState } from "react";
import { ulid } from "ulid";
import { fetchClient } from "~/lib/live-state";
import { portalAuthClient } from "~/lib/portal-auth-client";

type ThreadContent = JSONContent[];

//TODO: Use backend types
interface CreateThreadDialogProps {
  organization: {
    id: string;
    slug: string;
    name: string;
    logoUrl?: string | null;
  };
  portalSession: {
    user?: {
      id: string;
      name: string;
    } | null;
  } | null;
  trigger?: React.ReactNode;
}

export function CreateThreadDialog({
  organization,
  portalSession,
  trigger,
}: CreateThreadDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [threadTitle, setThreadTitle] = useState("");
  const [threadContent, setThreadContent] = useState<ThreadContent>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setThreadTitle("");
    setThreadContent([]);
    setError(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    setOpen(newOpen);
  };

  const validateForm = () => {
    if (!threadTitle.trim()) {
      setError("Thread title is required");
      return false;
    }
    if (threadTitle.trim().length < 3) {
      setError("Thread title must be at least 3 characters");
      return false;
    }
    if (!threadContent.length || !threadContent[0]?.content) {
      setError("Thread description is required");
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    const user = portalSession?.user;
    if (!user) {
      setError("You must be signed in to create a thread");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Get or create author
      const author = await fetchClient.query.author
        .first({ userId: user.id })
        .get();

      let authorId = author?.id;

      if (!authorId) {
        authorId = ulid().toLowerCase();
        await fetchClient.mutate.author.insert({
          id: authorId,
          userId: user.id,
          metaId: null,
          name: user.name,
          organizationId: organization.id,
        });
      }

      // Create thread
      const threadId = ulid().toLowerCase();
      await fetchClient.mutate.thread.insert({
        id: threadId,
        name: threadTitle.trim(),
        organizationId: organization.id,
        authorId: authorId,
        status: 0, // Open status
        priority: 0, // Normal priority
        assignedUserId: null,
        createdAt: new Date(),
        deletedAt: null,
        discordChannelId: null,
      });

      // Create first message
      const messageId = ulid().toLowerCase();
      await fetchClient.mutate.message.insert({
        id: messageId,
        authorId: authorId,
        content: JSON.stringify(threadContent),
        threadId: threadId,
        createdAt: new Date(),
        origin: null,
        externalMessageId: null,
      });
      
      // Close dialog and navigate to the new thread
      setOpen(false);
      resetForm();
      router.navigate({
        to: "/support/$slug/threads/$id",
        params: { slug: organization.slug, id: threadId },
      });
    } catch (err) {
      console.error("Failed to create thread:", err);
      setError("Failed to create thread. Please try again.");
      setIsSubmitting(false);
    }
  };

  // If user is not signed in, show sign-in dialog
  if (!portalSession?.user) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          {trigger ?? (
            <Button>
              <MessageSquarePlus />
              Create Thread
            </Button>
          )}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in required</DialogTitle>
            <DialogDescription>
              You need to sign in to create a new support thread.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() =>
                portalAuthClient.signIn.social({
                  provider: "google",
                  additionalData: { tenantSlug: organization.slug },
                  callbackURL: window.location.origin,
                })
              }
            >
              Sign in with Google
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <MessageSquarePlus />
            Create Thread
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-2xl p-0 gap-0 overflow-hidden"
        showCloseButton={false}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-medium">New thread</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => handleOpenChange(false)}
          >
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        <div className="flex flex-col p-4 gap-3">
          {error && (
            <div className="text-destructive text-sm bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="thread-title">Thread Title</Label>
            <Input
              placeholder="Enter title of your thread..."
              value={threadTitle}
              onChange={(e) => setThreadTitle(e.target.value)}
              disabled={isSubmitting}
              className="text-base"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="thread-content">Description</Label>
            <Editor value={threadContent} onValueChange={setThreadContent}>
              <EditorInput
                className="min-h-48 w-full shadow-lg bg-[#1B1B1E]"
                placeholder="Describe your question or issue..."
                clearOnSubmit={false}
              />
            </Editor>
          </div>
        </div>

        <div className="flex gap-3 justify-end px-4 pb-4">
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create thread"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
