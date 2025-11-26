import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { CopyInput } from "@workspace/ui/components/copy-value";
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
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { format } from "date-fns";
import { useAtomValue } from "jotai/react";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient } from "~/lib/live-state";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/api-keys",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isKeyDisplayDialogOpen, setIsKeyDisplayDialogOpen] = useState(false);
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [apiKeyName, setApiKeyName] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["organization", "api-keys", currentOrg?.id],
    queryFn: () => {
      if (!currentOrg) return [];

      return fetchClient.mutate.organization.listApiKeys({
        organizationId: currentOrg.id,
      });
    },
  });

  const handleRevoke = async (apiKeyId: string) => {
    if (!currentOrg) return;

    try {
      await fetchClient.mutate.organization.revokePublicApiKey({
        id: apiKeyId,
      });

      await queryClient.invalidateQueries({
        queryKey: ["organization", "api-keys", currentOrg.id],
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to revoke API key. Please try again.",
      );
    }
  };

  const handleCreateApiKey = async () => {
    if (!currentOrg) return;

    try {
      const result = await fetchClient.mutate.organization.createPublicApiKey({
        organizationId: currentOrg.id,
        name: apiKeyName || undefined,
      });

      setCreatedApiKey(result.key);
      setIsCreateDialogOpen(false);
      setIsKeyDisplayDialogOpen(true);
      setApiKeyName("");

      await queryClient.invalidateQueries({
        queryKey: ["organization", "api-keys", currentOrg.id],
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create API key. Please try again.",
      );
    }
  };

  return (
    <div className="p-4 flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between">
        <h2 className="text-base">API keys</h2>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              New API key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New API key</DialogTitle>
              <DialogDescription>
                Enter a name for your API key to help you identify it later.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="api-key-name">Name</Label>
                <Input
                  id="api-key-name"
                  placeholder="My API key"
                  value={apiKeyName}
                  onChange={(e) => setApiKeyName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && apiKeyName.trim()) {
                      handleCreateApiKey();
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateApiKey}
                disabled={!apiKeyName.trim()}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Dialog
        open={isKeyDisplayDialogOpen}
        onOpenChange={(open) => {
          // Only allow closing via the button, not by clicking outside or pressing escape
          if (!open) {
            return;
          }
          setIsKeyDisplayDialogOpen(open);
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          showCloseButton={false}
          onInteractOutside={(e) => {
            e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>API key created</DialogTitle>
            <DialogDescription>
              Make sure to copy your API key now. You won't be able to see it
              again!
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <CopyInput
              value={createdApiKey ?? ""}
              label="Your API key"
              inputClassName="font-mono text-sm"
              buttonAriaLabel="Copy API key"
            />
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm text-destructive">
              <strong>Warning:</strong> This is the only time you'll be able to
              visualize this API key. Make sure to copy it and store it
              securely.
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setIsKeyDisplayDialogOpen(false);
                setCreatedApiKey(null);
              }}
            >
              I've copied it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Card className="bg-[#27272A]/30">
        <CardContent className="gap-4">
          {isLoading ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 3 }).map((_, index) => (
                  <TableRow
                    // biome-ignore lint/suspicious/noArrayIndexKey: dummy key
                    key={index}
                  >
                    <TableCell>
                      <Skeleton className="w-24 h-4" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="w-24 h-4" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="w-24 h-4" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="w-8 h-8" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : data && data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((apiKey) => (
                  <TableRow key={apiKey.id}>
                    <TableCell>{apiKey.name ?? "Unnamed"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {apiKey.createdAt
                        ? format(new Date(apiKey.createdAt), "dd MMM. yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {apiKey.expiresAt
                        ? format(new Date(apiKey.expiresAt), "dd MMM. yyyy")
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Revoke API key"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Are you absolutely sure?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will
                              permanently revoke the API key{" "}
                              <strong>{apiKey.name ?? "Unnamed"}</strong>. Any
                              applications using this key will stop working
                              immediately.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => handleRevoke(apiKey.id)}
                            >
                              Revoke
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-muted-foreground">No API keys found</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
