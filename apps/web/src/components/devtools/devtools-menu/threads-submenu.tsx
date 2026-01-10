"use client";

import { MenuItem } from "@workspace/ui/components/menu";

interface ThreadsSubmenuProps {
  onOpenDialog: () => void;
}

export const ThreadsSubmenu = ({ onOpenDialog }: ThreadsSubmenuProps) => {
  return <MenuItem onClick={onOpenDialog}>Create Thread</MenuItem>;
};
