("use client");

import type { InferLiveObject } from "@live-state/sync";
import { useLiveQuery } from "@live-state/sync/client";
import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  getRouteApi,
  Link,
  notFound,
  useNavigate,
} from "@tanstack/react-router";
import { Avatar } from "@workspace/ui/components/avatar";
import {
  Editor,
  EditorInput,
  EditorSubmit,
  RichText,
} from "@workspace/ui/components/blocks/tiptap";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { ActionButton, Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { useAutoScroll } from "@workspace/ui/hooks/use-auto-scroll";
import { safeParseJSON } from "@workspace/ui/lib/tiptap";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";
import type { schema } from "api/schema";
import { Check, Copy, MoreHorizontalIcon, Trash2, X, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ulid } from "ulid";
import { IssuesSection } from "~/components/threads/issues";
import { LabelsSection } from "~/components/threads/labels";
import { PropertiesSection } from "~/components/threads/properties";
import { PullRequestsSection } from "~/components/threads/pull-requests";
import { Update } from "~/components/threads/updates";
import { ThreadCommands } from "~/lib/commands/commands/thread";
import { fetchClient, mutate, query } from "~/lib/live-state";
import { seo } from "~/utils/seo";
import { calculateDeletionDate, DAYS_UNTIL_DELETION } from "~/utils/thread";

export const Route = createFileRoute("/app/_workspace/_main/threads/$id")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const { id } = params;
    const thread = (
      await fetchClient.query.thread
        .where({ id })
        .include({
          organization: true,
          author: true,
          messages: { author: true },
          updates: true,
        })
        .get()
    )[0];

    if (!thread) {
      throw notFound();
    }

    return { thread };
  },
  head: ({ loaderData }) => {
    const thread = loaderData?.thread;
    const threadName = thread?.name ?? "Thread";
    return {
      meta: [
        ...seo({
          title: `${threadName} - Threads - FrontDesk`,
          description: `Support thread: ${threadName}`,
        }),
      ],
    };
  },
});

function RouteComponent() {
  const { user } = getRouteApi("/app").useRouteContext();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const thread = useLiveQuery(
    query.thread.where({ id }).include({
      organization: true,
      messages: { author: true },
      assignedUser: true,
      updates: { user: true },
    }),
  )?.[0];

  const organizationUsers = useLiveQuery(
    query.organizationUser
      .where({ organizationId: thread?.organizationId })
      .include({ user: true }),
  );

  const threadLabels = useLiveQuery(
    query.threadLabel
      .where({
        threadId: id,
        enabled: true,
        label: { enabled: true },
      })
      .include({ label: true }),
  );

  const suggestion = useLiveQuery(
    query.suggestion.first({
      type: "label",
      entityId: id,
      organizationId: thread?.organizationId,
    }),
  );

  const suggestionMetadata = useMemo(() => {
    if (!suggestion?.metadataStr) {
      return { dismissed: [], accepted: [] };
    }
    try {
      return JSON.parse(suggestion.metadataStr) as {
        dismissed?: string[];
        accepted?: string[];
      };
    } catch {
      return { dismissed: [], accepted: [] };
    }
  }, [suggestion?.metadataStr]);

  const dismissedLabelIds = new Set(suggestionMetadata.dismissed ?? []);

  const { data: suggestionsData, refetch: refetchSuggestions } = useQuery({
    queryKey: ["label-suggestions", id],
    queryFn: async () => {
      const result = await fetchClient.mutate.label.suggestLabels({
        threadId: id,
      });
      return result as { labelIds: string[]; cached: boolean };
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const suggestedLabelIds = useMemo(() => {
    if (!suggestionsData?.labelIds) return [];

    const appliedLabelIds = new Set(
      threadLabels?.map((tl) => tl.label.id) ?? [],
    );

    return suggestionsData.labelIds.filter(
      (labelId) =>
        !appliedLabelIds.has(labelId) && !dismissedLabelIds.has(labelId),
    );
  }, [suggestionsData?.labelIds, threadLabels, dismissedLabelIds]);

  const allItems = thread
    ? [
        ...(thread?.messages ?? []).map((msg) => ({
          ...msg,
          itemType: "message" as const,
        })),
        ...(thread?.updates ?? []).map((update) => ({
          ...update,
          itemType: "update" as const,
        })),
      ].sort((a, b) => a.id.localeCompare(b.id))
    : [];

  const { scrollRef, disableAutoScroll } = useAutoScroll({
    smooth: false,
    content: allItems,
    offset: 264,
  });

  const copyLinkToClipboard = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  const deleteThread = () => {
    mutate.thread.update(id, {
      deletedAt: calculateDeletionDate(),
    });
    setShowDeleteDialog(false);
    toast.success(`Thread will be deleted after ${DAYS_UNTIL_DELETION} days`, {
      duration: 10000,
      action: {
        label: "See list",
        onClick: () => navigate({ to: "/app/threads/archive" }),
      },
      actionButtonStyle: {
        background: "transparent",
        color: "hsl(var(--primary))",
        border: "none",
        textDecoration: "underline",
      },
    });
    navigate({ to: "/app/threads" });
  };

  const suggestedLabels = useLiveQuery(
    query.label.where({ id: { $in: suggestedLabelIds }, enabled: true }),
  );

  const handleAcceptLabel = async (labelId: string) => {
    const existingThreadLabel = threadLabels?.find(
      (tl) => tl.label.id === labelId,
    );

    if (existingThreadLabel) {
      mutate.threadLabel.update(existingThreadLabel.id, { enabled: true });
    } else {
      mutate.threadLabel.insert({
        id: ulid().toLowerCase(),
        threadId: id,
        labelId: labelId,
        enabled: true,
      });
    }

    await fetchClient.mutate.label.updateSuggestionMetadata({
      threadId: id,
      acceptedLabelIds: [labelId],
    });

    await refetchSuggestions();

    toast.success("Label added");
  };

  const handleAcceptAllLabels = async () => {
    for (const labelId of suggestedLabelIds) {
      const existingThreadLabel = threadLabels?.find(
        (tl) => tl.label.id === labelId,
      );

      if (existingThreadLabel) {
        mutate.threadLabel.update(existingThreadLabel.id, { enabled: true });
      } else {
        mutate.threadLabel.insert({
          id: ulid().toLowerCase(),
          threadId: id,
          labelId: labelId,
          enabled: true,
        });
      }
    }

    await fetchClient.mutate.label.updateSuggestionMetadata({
      threadId: id,
      acceptedLabelIds: suggestedLabelIds,
    });

    await refetchSuggestions();

    toast.success(
      `${suggestedLabelIds.length} label${suggestedLabelIds.length > 1 ? "s" : ""} added`,
    );
  };

  const handleDismissAllLabels = async () => {
    await fetchClient.mutate.label.updateSuggestionMetadata({
      threadId: id,
      dismissedLabelIds: suggestedLabelIds,
    });

    await refetchSuggestions();

    toast.success("Suggestions dismissed");
  };

  return (
    <>
      <ThreadCommands threadId={id} />
      <div className="flex size-full">
        <div className="flex-1 flex flex-col">
          <CardHeader>
            {thread && (
              <div className="flex justify-between items-center w-full">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        <Link to="/app/threads">Threads</Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild className="text-white">
                        <Link to="/app/threads/$id" params={{ id: id }}>
                          {thread.name}
                        </Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      aria-label="Open menu"
                      size="sm"
                      className="ml-auto"
                    >
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-40" align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuItem onSelect={() => copyLinkToClipboard()}>
                        <Copy />
                        Copy link
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setShowDeleteDialog(true)}
                      >
                        <Trash2 />
                        Delete thread
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Dialog
                  open={showDeleteDialog}
                  onOpenChange={setShowDeleteDialog}
                >
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Delete Thread</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to delete the thread "
                        {thread?.name}"?
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        type="submit"
                        variant="destructive"
                        onClick={() => {
                          deleteThread();
                        }}
                      >
                        Delete
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </CardHeader>
          <div className="flex flex-col p-4 gap-4 flex-1 w-full max-w-5xl mx-auto overflow-hidden">
            <div
              className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto"
              ref={scrollRef}
              onScroll={disableAutoScroll}
              onTouchMove={disableAutoScroll}
            >
              {allItems.map((item) => {
                if (item.itemType === "message") {
                  return (
                    <Card
                      key={item.id}
                      className={cn(
                        "relative before:w-[1px] before:h-4 before:left-4 before:absolute before:-top-4 not-first:before:bg-border",
                        item?.author?.userId === user.id &&
                          "border-[#2662D9]/20",
                      )}
                    >
                      <CardHeader
                        size="sm"
                        className={cn(
                          item?.author?.userId === user.id &&
                            "bg-[#2662D9]/15 border-[#2662D9]/20",
                        )}
                      >
                        <CardTitle>
                          <Avatar
                            variant="user"
                            size="md"
                            fallback={item.author.name}
                          />
                          <p>{item.author.name}</p>
                          <p className="text-muted-foreground">
                            {formatRelativeTime(item.createdAt as Date)}
                          </p>
                          {item.origin === "discord" && (
                            <>
                              <span className="bg-muted-foreground size-0.75 rounded-full" />
                              <p className="text-muted-foreground">
                                Imported from Discord
                              </p>
                            </>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <RichText content={safeParseJSON(item.content)} />
                      </CardContent>
                    </Card>
                  );
                }

                if (item.itemType === "update") {
                  return <Update key={item.id} update={item} user={user} />;
                }

                return null;
              })}
            </div>
            <div className="bottom-2.5 w-full flex flex-col bg-background-tertiary rounded-md border border-input">
              {suggestedLabelIds.length > 0 && (
                <div className="flex gap-2 items-center px-4 py-2">
                  <Zap className="size-3.5 text-foreground-secondary stroke-2" />
                  <div className="text-foreground-secondary mr-2">
                    Label suggestions
                  </div>

                  {suggestedLabelIds.map((label) => (
                    <ActionButton
                      key={label}
                      variant="ghost"
                      size="sm"
                      tooltip={`Add ${label} label`}
                      className="border border-dashed border-input dark:hover:bg-foreground-tertiary/15"
                      onClick={() => handleAcceptLabel(label)}
                    >
                      <div
                        className="size-2 rounded-full"
                        style={{ backgroundColor: "#000000" }}
                      />
                      {label}
                    </ActionButton>
                  ))}
                  <ActionButton
                    variant="ghost"
                    size="icon-sm"
                    tooltip="Accept all"
                    className="text-foreground-secondary"
                    onClick={handleAcceptAllLabels}
                  >
                    <Check />
                  </ActionButton>
                  <ActionButton
                    variant="ghost"
                    size="icon-sm"
                    tooltip="Ignore all"
                    className="text-foreground-secondary"
                    onClick={handleDismissAllLabels}
                  >
                    <X />
                  </ActionButton>
                </div>
              )}
              <Editor
                onSubmit={(value) => {
                  const author = query.author.first({ userId: user.id }).get();
                  let authorId = author?.id;

                  if (!authorId) {
                    authorId = ulid().toLowerCase();

                    mutate.author.insert({
                      id: authorId,
                      userId: user.id,
                      metaId: null,
                      name: user.name,
                      organizationId: thread?.organizationId,
                    });
                  }

                  mutate.message.insert({
                    id: ulid().toLowerCase(),
                    authorId: authorId,
                    content: JSON.stringify(value),
                    threadId: id,
                    createdAt: new Date(),
                    origin: null,
                    externalMessageId: null,
                  });
                }}
              >
                <EditorInput
                  className={cn(
                    "shadow-lg bg-[#1B1B1E] border-0",
                    suggestedLabelIds.length > 0 && "border-t",
                  )}
                  placeholder="Write a reply..."
                >
                  <EditorSubmit />
                </EditorInput>
              </Editor>
            </div>
          </div>
        </div>
        <div className="w-64 border-l bg-muted/25 flex flex-col p-4 gap-4">
          <TooltipProvider>
            <div className="flex flex-col gap-8">
              <PropertiesSection
                thread={thread}
                id={id}
                organizationUsers={organizationUsers}
                user={user as InferLiveObject<typeof schema.user>}
              />
              <LabelsSection threadId={id} />
              <div className="flex flex-col gap-2">
                <IssuesSection
                  threadId={id}
                  user={user}
                  externalIssueId={thread?.externalIssueId ?? null}
                  threadName={thread?.name}
                />
                <PullRequestsSection
                  threadId={id}
                  user={user}
                  externalPrId={thread?.externalPrId ?? null}
                />
              </div>
            </div>
          </TooltipProvider>
        </div>
      </div>
    </>
  );
}
