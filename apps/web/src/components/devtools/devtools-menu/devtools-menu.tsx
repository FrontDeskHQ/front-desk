"use client";

import {
  Menu,
  MenuContent,
  MenuTrigger,
  Submenu,
  SubmenuContent,
  SubmenuTrigger,
} from "@workspace/ui/components/menu";
import { useState } from "react";
import { CreateThreadDialog } from "./create-thread-dialog";
import { ThreadsSubmenu } from "./threads-submenu";

export const DevtoolsMenu = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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
        </MenuContent>
      </Menu>
      <CreateThreadDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </>
  );
};
