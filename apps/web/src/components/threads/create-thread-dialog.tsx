import type { InferLiveObject } from "@live-state/sync";
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
import type { schema } from "api/schema";
import { MessageSquarePlus, X } from "lucide-react";
import { useState } from "react";
import { fetchClient } from "~/lib/live-state";
import { portalAuthClient } from "~/lib/portal-auth-client";
import type { GetSupportAuthUserResponse } from "~/lib/server-funcs/get-portal-auth-user";

type ThreadContent = JSONContent[];

interface CreateThreadDialogProps {
  organization: InferLiveObject<(typeof schema)["organization"]>;
  portalSession: GetSupportAuthUserResponse;
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
    setIsSubmitting(false);
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
    if (!threadContent.length || !threadContent[0]?.content?.length) {
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
      const thread = await fetchClient.mutate.thread.createFromPortal({
        organizationId: organization.id,
        title: threadTitle.trim(),
        content: threadContent,
        userId: user.id,
        userName: user.name,
      });

      // Close dialog and navigate to the new thread
      setOpen(false);
      resetForm();
      router.navigate({
        to: "/support/$slug/threads/$id",
        params: { slug: organization.slug, id: thread.id },
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
              id="thread-title"
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
                id="thread-content"
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
