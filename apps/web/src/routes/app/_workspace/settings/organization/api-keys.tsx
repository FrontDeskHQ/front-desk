import { useFlag } from "@reflag/react-sdk";
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
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import {
  COPY_INPUT_ACTION_BUTTON_CLASSNAME,
  COPY_INPUT_ACTION_POSITION_CLASSNAME,
  CopyInput,
} from "@workspace/ui/components/copy-value";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import { Input, InputWithSeparator } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group";
import { Separator } from "@workspace/ui/components/separator";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { addDays, addYears, format } from "date-fns";
import { useAtomValue } from "jotai/react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { activeOrganizationAtom } from "~/lib/atoms";
import { fetchClient } from "~/lib/live-state";

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/api-keys"
)({
  component: RouteComponent,
  staticData: {
    breadcrumb: "API keys",
  },
});

function RouteComponent() {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const { isEnabled: privateApiKeysEnabled } = useFlag("private-api-keys");
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isKeyDisplayDialogOpen, setIsKeyDisplayDialogOpen] = useState(false);
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [apiKeyType, setApiKeyType] = useState<"private" | "public">("public");
  const [apiKeyName, setApiKeyName] = useState("");
  const [allowedOrigins, setAllowedOrigins] = useState<string[]>([]);
  const [isRotateDialogOpen, setIsRotateDialogOpen] = useState(false);
  const [widgetSecret, setWidgetSecret] = useState<string | null>(null);
  const [isSavingWidgetSettings, setIsSavingWidgetSettings] = useState(false);
  const [isRotatingWidgetSecret, setIsRotatingWidgetSecret] = useState(false);
  const [dirtyWidgetOrganizationId, setDirtyWidgetOrganizationId] = useState<
    string | null
  >(null);
  const hydratedWidgetOrganizationId = useRef<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(() =>
    format(addYears(new Date(), 1), "yyyy-MM-dd")
  );

  const { data, isLoading } = useQuery({
    queryFn: () => {
      if (!currentOrg) return [];

      return fetchClient.mutate.organization.listApiKeys({
        organizationId: currentOrg.id,
      });
    },
    queryKey: ["organization", "api-keys", currentOrg?.id],
  });

  const { data: widgetIdentitySettings, isLoading: isWidgetSettingsLoading } =
    useQuery({
      enabled: currentOrg !== undefined,
      queryFn: () => {
        if (!currentOrg) return null;

        return fetchClient.query.organization.widgetIdentitySettings({
          organizationId: currentOrg.id,
        });
      },
      queryKey: ["organization", "widget-identity", currentOrg?.id],
    });
  const currentOrgId = currentOrg?.id;

  useEffect(() => {
    setWidgetSecret(null);
  }, [currentOrgId]);

  useEffect(() => {
    if (!currentOrgId || !widgetIdentitySettings) return;
    if (
      hydratedWidgetOrganizationId.current === currentOrgId ||
      dirtyWidgetOrganizationId === currentOrgId
    ) {
      return;
    }

    setAllowedOrigins(widgetIdentitySettings.allowedOrigins);
    setDirtyWidgetOrganizationId(null);
    hydratedWidgetOrganizationId.current = currentOrgId;
  }, [currentOrgId, dirtyWidgetOrganizationId, widgetIdentitySettings]);

  const getAllowedOrigins = (): string[] =>
    Array.from(
      new Set(allowedOrigins.map((origin) => origin.trim()).filter(Boolean))
    );
  const isOriginsDirty = dirtyWidgetOrganizationId === currentOrgId;

  const handleSaveWidgetSettings = async () => {
    if (!currentOrg || !widgetIdentitySettings) return;

    setIsSavingWidgetSettings(true);
    try {
      await fetchClient.mutate.organization.updateWidgetIdentity({
        allowedOrigins: getAllowedOrigins(),
        organizationId: currentOrg.id,
      });
      await queryClient.invalidateQueries({
        queryKey: ["organization", "widget-identity", currentOrg.id],
      });
      setDirtyWidgetOrganizationId(null);
      toast.success("Widget identity settings saved");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save widget identity settings. Please try again."
      );
    } finally {
      setIsSavingWidgetSettings(false);
    }
  };

  const handleRotateWidgetSecret = async () => {
    if (!currentOrg || !widgetIdentitySettings) return;

    setIsRotateDialogOpen(false);
    setIsRotatingWidgetSecret(true);
    try {
      const result =
        await fetchClient.mutate.organization.rotateWidgetSigningSecret({
          allowedOrigins: getAllowedOrigins(),
          organizationId: currentOrg.id,
        });
      setWidgetSecret(result.secret);
      await queryClient.invalidateQueries({
        queryKey: ["organization", "widget-identity", currentOrg.id],
      });
      setDirtyWidgetOrganizationId(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to rotate the widget signing secret. Please try again."
      );
    } finally {
      setIsRotatingWidgetSecret(false);
    }
  };

  const handleRevoke = async (apiKeyId: string, type: "private" | "public") => {
    if (!currentOrg) {
      return;
    }

    try {
      if (type === "private") {
        await fetchClient.mutate.organization.revokePrivateApiKey({
          id: apiKeyId,
        });
      } else {
        await fetchClient.mutate.organization.revokePublicApiKey({
          id: apiKeyId,
        });
      }

      await queryClient.invalidateQueries({
        queryKey: ["organization", "api-keys", currentOrg.id],
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to revoke API key. Please try again."
      );
    }
  };

  const handleCreateApiKey = async () => {
    if (!currentOrg) {
      return;
    }

    try {
      const result =
        apiKeyType === "private"
          ? await fetchClient.mutate.organization.createPrivateApiKey({
              expiresAt: `${expiresAt}T00:00:00.000Z`,
              name: apiKeyName.trim(),
              organizationId: currentOrg.id,
            })
          : await fetchClient.mutate.organization.createPublicApiKey({
              name: apiKeyName.trim(),
              organizationId: currentOrg.id,
            });

      setCreatedApiKey(result.key);
      setIsCreateDialogOpen(false);
      setIsKeyDisplayDialogOpen(true);
      setApiKeyName("");
      setApiKeyType("public");
      setExpiresAt(format(addYears(new Date(), 1), "yyyy-MM-dd"));

      await queryClient.invalidateQueries({
        queryKey: ["organization", "api-keys", currentOrg.id],
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create API key. Please try again."
      );
    }
  };

  return (
    <div className="p-4 flex flex-col gap-4 w-full">
      <h2 className="text-base">Widget</h2>
      <Card className="bg-[#27272A]/30">
        <CardContent className="gap-4">
          {isWidgetSettingsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="widget-secret-key">Secret key</Label>
                <div className="relative">
                  <Input
                    id="widget-secret-key"
                    readOnly
                    value={
                      widgetSecret
                        ? widgetSecret
                        : `${widgetIdentitySettings?.secretPrefix ?? "fd_wsk_"}****`
                    }
                    className="pe-10 font-mono text-sm"
                  />
                  <div className={COPY_INPUT_ACTION_POSITION_CLASSNAME}>
                    <div className="pointer-events-auto">
                      {widgetSecret ? (
                        <CopyInput.Button
                          value={widgetSecret}
                          ariaLabel="Copy secret key"
                          tooltip="Copy"
                          variant="ghost"
                          className={COPY_INPUT_ACTION_BUTTON_CLASSNAME}
                        />
                      ) : (
                        <AlertDialog
                          open={isRotateDialogOpen}
                          onOpenChange={setIsRotateDialogOpen}
                        >
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger
                                render={<span className="inline-flex" />}
                              >
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={
                                      COPY_INPUT_ACTION_BUTTON_CLASSNAME
                                    }
                                    aria-label={
                                      widgetIdentitySettings?.configured
                                        ? "Rotate secret key"
                                        : "Generate secret key"
                                    }
                                    disabled={
                                      !widgetIdentitySettings ||
                                      isSavingWidgetSettings ||
                                      isRotatingWidgetSecret
                                    }
                                  >
                                    <RefreshCw
                                      className={`h-4 w-4 ${isRotatingWidgetSecret ? "animate-spin" : ""}`}
                                    />
                                  </Button>
                                </AlertDialogTrigger>
                              </TooltipTrigger>
                              <TooltipContent>
                                {widgetIdentitySettings?.configured
                                  ? "Rotate secret key"
                                  : "Generate secret key"}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {widgetIdentitySettings?.configured
                                  ? "Rotate the widget signing secret?"
                                  : "Generate a widget signing secret?"}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {widgetIdentitySettings?.configured
                                  ? "Existing tokens signed with the previous secret remain valid briefly. Update your server environment with the new secret as soon as it is shown."
                                  : "A signing secret will be generated for widget identity verification. Copy it into your backend's FRONTDESK_SECRET_KEY environment variable."}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={handleRotateWidgetSecret}
                              >
                                {widgetIdentitySettings?.configured
                                  ? "Rotate secret"
                                  : "Generate secret"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Allowed origins (optional)</Label>
                <InputWithSeparator
                  placeholder="https://app.example.com"
                  value={allowedOrigins}
                  onValueChange={(value) => {
                    setAllowedOrigins(value);
                    setDirtyWidgetOrganizationId(currentOrg?.id ?? null);
                  }}
                />
                <p className="text-muted-foreground text-xs">
                  Add one exact site origin at a time. Leave empty to allow
                  requests from any origin.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button
          onClick={handleSaveWidgetSettings}
          disabled={
            !widgetIdentitySettings ||
            !isOriginsDirty ||
            isSavingWidgetSettings ||
            isRotatingWidgetSecret ||
            isWidgetSettingsLoading
          }
        >
          {isSavingWidgetSettings ? "Saving…" : "Save"}
        </Button>
      </div>
      <Separator className="my-6" />
      <div className="flex items-center justify-between">
        <h2 className="text-base">API keys</h2>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger render={<Button />}>
            <Plus />
            New API key
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New API key</DialogTitle>
              <DialogDescription>
                Enter a name for your API key to help you identify it later.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              {privateApiKeysEnabled ? (
                <div className="flex flex-col gap-2">
                  <Label>Type</Label>
                  <RadioGroup
                    value={apiKeyType}
                    onValueChange={(value) =>
                      setApiKeyType(value as "private" | "public")
                    }
                    className="grid grid-cols-2"
                  >
                    <Label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                      <RadioGroupItem value="public" />
                      <span>
                        <span className="block">Public</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          For public-facing integrations
                        </span>
                      </span>
                    </Label>
                    <Label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                      <RadioGroupItem value="private" />
                      <span>
                        <span className="block">Private</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          For trusted server requests
                        </span>
                      </span>
                    </Label>
                  </RadioGroup>
                </div>
              ) : null}
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
              {apiKeyType === "private" ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="api-key-expiration">Expiration</Label>
                  <Input
                    id="api-key-expiration"
                    type="date"
                    min={format(addDays(new Date(), 1), "yyyy-MM-dd")}
                    max={format(addYears(new Date(), 1), "yyyy-MM-dd")}
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                  />
                </div>
              ) : null}
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
                disabled={
                  !apiKeyName.trim() || (apiKeyType === "private" && !expiresAt)
                }
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
        <DialogContent className="sm:max-w-lg" showCloseButton={false}>
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
                  <TableHead>Type</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[50px]" />
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
                      <Skeleton className="w-16 h-4" />
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
                  <TableHead>Type</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((apiKey) => (
                  <TableRow key={apiKey.id}>
                    <TableCell>{apiKey.name ?? "Unnamed"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {apiKey.type}
                      </Badge>
                    </TableCell>
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
                              onClick={() =>
                                handleRevoke(apiKey.id, apiKey.type)
                              }
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
