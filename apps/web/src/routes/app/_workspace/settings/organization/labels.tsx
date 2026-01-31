import { useLiveQuery } from "@live-state/sync/client";
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
import { format } from "date-fns";
import { useAtomValue } from "jotai/react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ulid } from "ulid";
import { activeOrganizationAtom } from "~/lib/atoms";
import { mutate, query } from "~/lib/live-state";

// CSS variable names for the color selector buttons (for dark mode support)
const LABEL_COLOR_VARS: readonly string[] = [
  "var(--label-color-red)",
  "var(--label-color-orange)",
  "var(--label-color-yellow)",
  "var(--label-color-green)",
  "var(--label-color-teal)",
  "var(--label-color-blue)",
  "var(--label-color-purple)",
  "var(--label-color-pink)",
];

export const Route = createFileRoute(
  "/app/_workspace/settings/organization/labels",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<{
    id: string;
    name: string;
    color: string;
  } | null>(null);
  const [labelName, setLabelName] = useState("");
  const [selectedColorIndex, setSelectedColorIndex] = useState<number>(0);

  const allLabels = useLiveQuery(
    query.label.where({
      organizationId: currentOrg?.id,
    }),
  );

  const labels = useMemo(() => {
    if (!allLabels) return [];
    return allLabels.filter((label) => label.enabled !== false);
  }, [allLabels]);

  const handleDelete = (labelId: string, labelName: string) => {
    if (!currentOrg) return;

    try {
      // Set enabled to false instead of deleting
      mutate.label.update(labelId, {
        enabled: false,
        updatedAt: new Date(),
      });
      toast.success(`Label "${labelName}" deleted successfully`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to delete label. Please try again.",
      );
    }
  };

  const handleCreateLabel = () => {
    if (!currentOrg) return;

    try {
      const colorVar = LABEL_COLOR_VARS[selectedColorIndex];

      mutate.label.insert({
        id: ulid().toLowerCase(),
        name: labelName.trim() || "",
        color: colorVar,
        createdAt: new Date(),
        updatedAt: new Date(),
        organizationId: currentOrg.id,
        enabled: true,
      });

      setIsCreateDialogOpen(false);
      setLabelName("");
      setSelectedColorIndex(0);
      toast.success("Label created successfully");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create label. Please try again.",
      );
    }
  };

  const handleEditLabel = () => {
    if (!editingLabel) return;

    try {
      const colorVar = LABEL_COLOR_VARS[selectedColorIndex];

      mutate.label.update(editingLabel.id, {
        name: labelName,
        color: colorVar,
        updatedAt: new Date(),
      });

      setIsEditDialogOpen(false);
      setEditingLabel(null);
      setLabelName("");
      setSelectedColorIndex(0);
      toast.success("Label updated successfully");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update label. Please try again.",
      );
    }
  };

  const handleOpenEditDialog = (label: {
    id: string;
    name: string;
    color: string;
  }) => {
    setEditingLabel(label);
    setLabelName(label.name);
    // Find matching color by comparing computed values
    let matchingIndex = 0;
    if (typeof document !== "undefined") {
      for (let i = 0; i < LABEL_COLOR_VARS.length; i++) {
        if (LABEL_COLOR_VARS[i] === label.color) {
          matchingIndex = i;
          break;
        }
      }
    }
    setSelectedColorIndex(matchingIndex);
    setIsEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setIsEditDialogOpen(false);
    setEditingLabel(null);
    setLabelName("");
    setSelectedColorIndex(0);
  };

  const handleCloseCreateDialog = () => {
    setIsCreateDialogOpen(false);
    setLabelName("");
    setSelectedColorIndex(0);
  };

  return (
    <div className="p-4 flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between">
        <h2 className="text-base">Labels</h2>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger render={<Button />}>
            <Plus />
            New label
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New label</DialogTitle>
              <DialogDescription>
                Enter a name and color for your label to help you organize
                threads.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="label-name">Name</Label>
                <Input
                  id="label-name"
                  placeholder="My label"
                  value={labelName}
                  onChange={(e) => setLabelName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && labelName.trim()) {
                      handleCreateLabel();
                    }
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Color</Label>
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-8 gap-2">
                    {LABEL_COLOR_VARS.map((colorVar, index) => (
                      <button
                        key={colorVar}
                        type="button"
                        onClick={() => setSelectedColorIndex(index)}
                        className={`
                          h-10 w-full rounded border-1 transition-all
                          ${
                            selectedColorIndex === index
                              ? "border-foreground scale-105"
                              : "border-border-primary hover:border-border-secondary"
                          }
                        `}
                        style={{ backgroundColor: colorVar }}
                        aria-label={`Select color ${index + 1}`}
                        aria-pressed={selectedColorIndex === index}
                      />
                    ))}
                  </div>
                  {/* <div className="flex items-center gap-2">
                    <LabelBadge
                      name={labelName || "Preview"}
                      color={LABEL_COLOR_VARS[selectedColorIndex]}
                    />
                    <span className="text-xs text-foreground-secondary">
                      Selected color
                    </span>
                  </div> */}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCloseCreateDialog}>
                Cancel
              </Button>
              <Button onClick={handleCreateLabel} disabled={!labelName.trim()}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Dialog open={isEditDialogOpen} onOpenChange={handleCloseEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit label</DialogTitle>
            <DialogDescription>
              Update the name and color for your label.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-label-name">Name</Label>
              <Input
                id="edit-label-name"
                placeholder="My label"
                value={labelName}
                onChange={(e) => setLabelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && labelName.trim()) {
                    handleEditLabel();
                  }
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Color</Label>
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-8 gap-2">
                  {LABEL_COLOR_VARS.map((colorVar, index) => (
                    <button
                      key={colorVar}
                      type="button"
                      onClick={() => setSelectedColorIndex(index)}
                      className={`
                        h-10 w-full rounded border-1 transition-all
                        ${
                          selectedColorIndex === index
                            ? "border-foreground scale-105"
                            : "border-border-primary hover:border-border-secondary"
                        }
                      `}
                      style={{ backgroundColor: colorVar }}
                      aria-label={`Select color ${index + 1}`}
                      aria-pressed={selectedColorIndex === index}
                    />
                  ))}
                </div>
                {/* <div className="flex items-center gap-2">
                  <LabelBadge
                    name={labelName || "Preview"}
                    color={LABEL_COLOR_VARS[selectedColorIndex]}
                  />
                  <span className="text-xs text-foreground-secondary">
                    Selected color
                  </span>
                </div> */}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseEditDialog}>
              Cancel
            </Button>
            <Button onClick={handleEditLabel} disabled={!labelName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Card className="bg-background-tertiary">
        <CardContent className="gap-4">
          {labels.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-7.5">Label</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {labels.map((label) => (
                  <TableRow key={label.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className="size-[10px] rounded-full shrink-0"
                          style={{ backgroundColor: label.color }}
                        />
                        <div className="truncate grow shrink">{label.name}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-foreground-secondary">
                      {label.createdAt
                        ? format(new Date(label.createdAt), "dd MMM. yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            handleOpenEditDialog({
                              id: label.id,
                              name: label.name,
                              color: label.color,
                            })
                          }
                          aria-label="Edit label"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Delete label"
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
                                This will disable the label{" "}
                                <strong>{label.name}</strong>. It will no longer
                                appear in label selection, but existing thread
                                assignments will remain.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={() =>
                                  handleDelete(label.id, label.name)
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
            <div className="text-foreground-secondary">No labels found</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
