import { useLiveQuery } from "@live-state/sync/client";
import { useFlag } from "@reflag/react-sdk";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
import { Badge } from "@workspace/ui/components/badge";
import { ActionButton, Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Composite,
  CompositeItem,
} from "@workspace/ui/components/composite";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { cn, formatRelativeTime } from "@workspace/ui/lib/utils";
import { useAtomValue } from "jotai/react";
import {
  AlertCircle,
  ChevronDown,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Fragment, useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient, query } from "~/lib/live-state";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/documentation",
)({
  component: RouteComponent,
});

const statusVariant = (
  status: string,
): "default" | "success" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "completed":
      return "success";
    case "crawling":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
};

function RouteComponent() {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const { isEnabled } = useFlag("documentation-crawler");

  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [validation, setValidation] = useState<{
    status: "idle" | "validating" | "valid" | "error";
    error?: string;
  }>({ status: "idle" });

  const sources = useLiveQuery(
    query.documentationSource.where({
      organizationId: currentOrg?.id,
    }),
  );

  const filteredSources = (sources ?? []).filter(
    (s: any) => s.status !== "deleted",
  );

  const addMutation = useMutation({
    mutationFn: async ({
      organizationId,
      name,
      baseUrl,
    }: {
      organizationId: string;
      name: string;
      baseUrl: string;
    }) => {
      return fetchClient.mutate.documentationSource.addDocumentationSource({
        organizationId,
        name,
        baseUrl,
      });
    },
    onSuccess: () => {
      setIsAddPanelOpen(false);
      setName("");
      setBaseUrl("");
      setValidation({ status: "idle" });
      toast.success("Documentation source added. Crawling will begin shortly.");
    },
    onError: (error) => {
      setValidation({
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Failed to add documentation source.",
      });
    },
  });

  const recrawlMutation = useMutation({
    mutationFn: async (id: string) => {
      return fetchClient.mutate.documentationSource.recrawlDocumentationSource({
        id,
      });
    },
    onSuccess: () => {
      toast.success("Recrawl started.");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to start recrawl.",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return fetchClient.mutate.documentationSource.deleteDocumentationSource({
        id,
      });
    },
    onSuccess: () => {
      toast.success("Documentation source deleted.");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to delete documentation source.",
      );
    },
  });

  const isSubmitting =
    validation.status === "validating" || addMutation.isPending;

  const handleAdd = useCallback(async () => {
    if (
      isSubmitting ||
      !currentOrg ||
      !name.trim() ||
      name.length > 100 ||
      !baseUrl.trim()
    )
      return;

    setValidation({ status: "validating" });

    try {
      const result =
        await fetchClient.mutate.documentationSource.validateDocumentationSource(
          {
            organizationId: currentOrg.id,
            baseUrl: baseUrl.trim(),
          },
        );

      if (!result.valid) {
        setValidation({ status: "error", error: result.error });
        return;
      }

      setValidation({ status: "valid" });
      addMutation.mutate({
        organizationId: currentOrg.id,
        name: name.trim(),
        baseUrl: baseUrl.trim(),
      });
    } catch (err) {
      setValidation({
        status: "error",
        error:
          err instanceof Error ? err.message : "Validation failed unexpectedly",
      });
    }
  }, [currentOrg, name, baseUrl, addMutation, isSubmitting]);

  const handleClosePanel = () => {
    setIsAddPanelOpen(false);
    setName("");
    setBaseUrl("");
    setValidation({ status: "idle" });
  };

  if (!isEnabled) {
    return (
      <div className="p-4 flex flex-col gap-4 w-full">
        <h2 className="text-base">Documentation</h2>
        <Card className="bg-[#27272A]/30">
          <CardContent>
            <div className="text-muted-foreground">
              The documentation crawler feature is not available for your
              organization.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between">
        <h2 className="text-base">Documentation</h2>
        <Button onClick={() => setIsAddPanelOpen(true)}>
          <Plus />
          Add source
        </Button>
      </div>
      <AnimatePresence>
        {isAddPanelOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden"
            onAnimationComplete={() => nameInputRef.current?.focus()}
          >
            <Card className="bg-[#27272A]/30">
              <CardContent>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Add documentation source
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleClosePanel}
                      disabled={isSubmitting}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    The site must have a sitemap.xml and serve markdown versions
                    of pages.
                  </p>
                  {validation.status === "error" && (
                    <div className="flex items-start gap-2 text-sm text-red-500 dark:text-red-400 bg-red-500/5 border border-red-500/20 rounded-md p-3">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{validation.error}</span>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <div className="flex flex-col gap-1.5 flex-1">
                      <Label htmlFor="doc-name" className="text-xs">
                        Name
                      </Label>
                      <Input
                        ref={nameInputRef}
                        id="doc-name"
                        placeholder="My Documentation"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={isSubmitting}
                        maxLength={100}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 flex-1">
                      <Label htmlFor="doc-url" className="text-xs">
                        Base URL
                      </Label>
                      <Input
                        id="doc-url"
                        placeholder="https://docs.example.com"
                        value={baseUrl}
                        disabled={isSubmitting}
                        onChange={(e) => {
                          setBaseUrl(e.target.value);
                          if (validation.status !== "idle") {
                            setValidation({ status: "idle" });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            !isSubmitting &&
                            name.trim() &&
                            name.length <= 100 &&
                            baseUrl.trim()
                          ) {
                            e.preventDefault();
                            handleAdd();
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={handleAdd}
                      disabled={
                        !name.trim() ||
                        name.length > 100 ||
                        !baseUrl.trim() ||
                        isSubmitting
                      }
                    >
                      {(validation.status === "validating" ||
                        addMutation.isPending) && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {validation.status === "validating"
                        ? "Validating..."
                        : "Add"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      <Card className="bg-[#27272A]/30">
        <CardContent className="gap-0 p-0">
          <div className="p-4">
            {filteredSources.length > 0 ? (
              <div className="flex flex-col gap-0">
                <div className="grid grid-cols-[2rem_1fr_1fr_auto_4rem] items-center gap-x-4 px-3 py-2 text-xs text-muted-foreground font-medium">
                  <span />
                  <span>Name</span>
                  <span>URL</span>
                  <span>Status</span>
                  <span>Pages</span>
                </div>
                <Composite className="gap-0">
                  {filteredSources.map((source: any) => {
                    const isExpanded = expandedRows.has(source.id);
                    return (
                      <Fragment key={source.id}>
                        <CompositeItem
                          className={cn(
                            "grid grid-cols-[2rem_1fr_1fr_auto_4rem] items-center gap-x-4 w-full rounded-none border-0 px-3 py-2.5 text-sm",
                            "border-b border-border/50 last:border-b-0",
                            isExpanded && "border-b-transparent",
                          )}
                          aria-expanded={isExpanded}
                          aria-controls={`details-${source.id}`}
                          onClick={() =>
                            setExpandedRows((prev) => {
                              const next = new Set(prev);
                              if (next.has(source.id)) {
                                next.delete(source.id);
                              } else {
                                next.add(source.id);
                              }
                              return next;
                            })
                          }
                        >
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 text-muted-foreground transition-transform",
                              isExpanded ? "rotate-0" : "-rotate-90",
                            )}
                          />
                          <span className="font-medium truncate text-left">
                            {source.name}
                          </span>
                          <span className="text-muted-foreground truncate text-left">
                            {source.baseUrl}
                          </span>
                          <Badge variant={statusVariant(source.status)}>
                            {source.status.charAt(0).toUpperCase() +
                              source.status.slice(1)}
                          </Badge>
                          <span className="text-muted-foreground">
                            {source.pageCount}
                          </span>
                        </CompositeItem>
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              key={`${source.id}-details`}
                              id={`details-${source.id}`}
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{
                                duration: 0.15,
                                ease: "easeOut",
                              }}
                              className="overflow-hidden border-b border-border/50"
                            >
                              <div className="px-6 py-3 flex items-center justify-between">
                                <div className="flex gap-6 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">
                                      Last crawled:{" "}
                                    </span>
                                    {source.lastCrawledAt
                                      ? formatRelativeTime(
                                          new Date(source.lastCrawledAt),
                                        )
                                      : "Never"}
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">
                                      Chunks:{" "}
                                    </span>
                                    {source.chunksIndexed}
                                  </div>
                                </div>
                                <TooltipProvider>
                                  <div className="flex gap-2">
                                    <ActionButton
                                      variant="ghost"
                                      size="sm"
                                      tooltip="Re-crawl this documentation source"
                                      disabled={
                                        source.status === "crawling" ||
                                        recrawlMutation.isPending
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        recrawlMutation.mutate(source.id);
                                      }}
                                    >
                                      <RefreshCw className="h-3.5 w-3.5" />
                                      Recrawl
                                    </ActionButton>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <ActionButton
                                          variant="ghost"
                                          size="sm"
                                          tooltip="Delete this documentation source and all indexed content"
                                          onClick={(e) =>
                                            e.stopPropagation()
                                          }
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                          Delete
                                        </ActionButton>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>
                                            Are you sure?
                                          </AlertDialogTitle>
                                          <AlertDialogDescription>
                                            This will delete the
                                            documentation source{" "}
                                            <strong>{source.name}</strong>{" "}
                                            and all its indexed content.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>
                                            Cancel
                                          </AlertDialogCancel>
                                          <AlertDialogAction
                                            variant="destructive"
                                            disabled={
                                              deleteMutation.isPending
                                            }
                                            onClick={() =>
                                              deleteMutation.mutate(
                                                source.id,
                                              )
                                            }
                                          >
                                            Delete
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </TooltipProvider>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </Fragment>
                    );
                  })}
                </Composite>
              </div>
            ) : (
              <div className="text-muted-foreground">
                No documentation sources added yet.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
