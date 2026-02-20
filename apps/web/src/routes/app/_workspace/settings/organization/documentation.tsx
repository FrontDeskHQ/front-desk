import { useFlag } from "@reflag/react-sdk";
import { useLiveQuery } from "@live-state/sync/client";
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
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { useAtomValue } from "jotai/react";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
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
): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "completed":
      return "default";
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

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

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
      setIsCreateDialogOpen(false);
      setName("");
      setBaseUrl("");
      toast.success("Documentation source added. Crawling will begin shortly.");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to add documentation source.",
      );
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

  const handleAdd = () => {
    if (
      !currentOrg ||
      !name.trim() ||
      name.length > 100 ||
      !baseUrl.trim()
    )
      return;
    addMutation.mutate({
      organizationId: currentOrg.id,
      name: name.trim(),
      baseUrl: baseUrl.trim(),
    });
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
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger render={<Button />}>
            <Plus />
            Add source
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add documentation source</DialogTitle>
              <DialogDescription>
                Add a documentation site to crawl. The site must have a
                sitemap.xml and serve markdown versions of pages.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="doc-name">Name</Label>
                <Input
                  id="doc-name"
                  placeholder="My Documentation"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  aria-describedby="doc-name-hint"
                />
                <p
                  id="doc-name-hint"
                  className="text-muted-foreground text-xs"
                >
                  Max 100 characters
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="doc-url">Base URL</Label>
                <Input
                  id="doc-url"
                  placeholder="https://docs.example.com"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      name.trim() &&
                      name.length <= 100 &&
                      baseUrl.trim()
                    ) {
                      handleAdd();
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                disabled={addMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAdd}
                disabled={
                  !name.trim() ||
                  name.length > 100 ||
                  !baseUrl.trim() ||
                  addMutation.isPending
                }
              >
                {addMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card className="bg-[#27272A]/30">
        <CardContent className="gap-4">
          {filteredSources.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pages</TableHead>
                  <TableHead>Chunks</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSources.map((source: any) => (
                  <TableRow key={source.id}>
                    <TableCell className="font-medium">
                      {source.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">
                      {source.baseUrl}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(source.status)}>
                        {source.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {source.pageCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {source.chunksIndexed}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Recrawl"
                          disabled={
                            source.status === "crawling" ||
                            recrawlMutation.isPending
                          }
                          onClick={() => recrawlMutation.mutate(source.id)}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Delete documentation source"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Are you sure?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This will delete the documentation source{" "}
                                <strong>{source.name}</strong> and all its
                                indexed content.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                disabled={deleteMutation.isPending}
                                onClick={() =>
                                  deleteMutation.mutate(source.id)
                                }
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-muted-foreground">
              No documentation sources added yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
