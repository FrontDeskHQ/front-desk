"use client";

import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Submenu,
  SubmenuContent,
  SubmenuTrigger,
} from "@workspace/ui/components/menu";
import { useState } from "react";
import { useReactScanEnabled } from "../react-scan";
import { CreateThreadDialog } from "./create-thread-dialog";
import { ThreadsSubmenu } from "./threads-submenu";

interface DevtoolsMenuProps {
  onHideToolbar: (mode: "temporary" | "section") => void;
}

export const DevtoolsMenu = ({ onHideToolbar }: DevtoolsMenuProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [reactScanEnabled, setReactScanEnabled] = useReactScanEnabled();

  const handleToggleReactScan = (checked: boolean) => {
    setReactScanEnabled(checked);
  };

  const handleHideTemporary = () => {
    onHideToolbar("temporary");
  };

  const handleHideForSection = () => {
    onHideToolbar("section");
  };

  return (
    <>
      <Menu>
        <MenuTrigger className="h-5 px-2 hover:bg-background-tertiary rounded-sm transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring">
          Devtools
        </MenuTrigger>
        <MenuContent>
          <Submenu>
            <SubmenuTrigger>Threads</SubmenuTrigger>
            <SubmenuContent>
              <ThreadsSubmenu onOpenDialog={() => setIsDialogOpen(true)} />
            </SubmenuContent>
          </Submenu>
          <Submenu>
            <SubmenuTrigger>Hide Toolbar</SubmenuTrigger>
            <SubmenuContent>
              <MenuItem onClick={handleHideTemporary}>Hide Toolbar</MenuItem>
              <MenuItem onClick={handleHideForSection}>
                Hide for this Section
              </MenuItem>
            </SubmenuContent>
          </Submenu>
          <MenuSeparator />
          <MenuCheckboxItem
            checked={reactScanEnabled}
            onCheckedChange={handleToggleReactScan}
          >
            React Scan
          </MenuCheckboxItem>
        </MenuContent>
      </Menu>
      <CreateThreadDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </>
  );
};
