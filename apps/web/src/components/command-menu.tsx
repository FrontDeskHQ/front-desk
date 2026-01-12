"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  CommandTrail,
} from "@workspace/ui/components/command";
import { Keybind } from "@workspace/ui/components/keybind";
import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { RootCommands } from "~/lib/commands/commands/root";
import { useCommandMenu } from "~/lib/commands/hooks";
import type { Command, DirectCommand, PageCommand } from "~/lib/commands/types";

export const CommandMenu = () => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [animationKey, setAnimationKey] = useState(0);
  const prevPageIdRef = useRef<string | null>(null);
  const {
    commands,
    contextCommands,
    globalCommands,
    currentPage,
    currentPageId,
    currentContextId,
    goBack,
    navigateToPage,
    resetNavigation,
  } = useCommandMenu();

  useHotkeys("mod+k", (e) => {
    e.preventDefault();
    setOpen(true);
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      e.key === "Backspace" &&
      search === "" &&
      (currentPageId || currentContextId)
    ) {
      e.preventDefault();
      goBack();
    }
  };

  // When closing, save current context
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        resetNavigation();
        setSearch("");
      }, 100);
    }
  }, [open]);

  // Trigger animation on navigation
  useEffect(() => {
    if (prevPageIdRef.current !== currentPageId && open) {
      setAnimationKey((prev) => prev + 1);
    }
    prevPageIdRef.current = currentPageId;
  }, [currentPageId, open]);

  const handleCommandSelect = (command: Command) => {
    if ((command as PageCommand).pageId) {
      navigateToPage((command as PageCommand).pageId);
      setSearch("");
    } else {
      (command as DirectCommand).onSelect();
      setOpen(false);
    }
  };

  // Filter commands by search query
  const filterCommand = (command: Command) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      command.label.toLowerCase().includes(searchLower) ||
      command.keywords?.some((keyword) =>
        keyword.toLowerCase().includes(searchLower),
      )
    );
  };

  const pageUngrouped: Command[] = [];
  const pageGrouped: Record<string, Command[]> = {};

  const filteredPageCommands = commands.filter(filterCommand);

  // Separate grouped vs ungrouped for page commands
  filteredPageCommands.forEach((command) => {
    const group = command.group ?? "";
    if (group === "") {
      pageUngrouped.push(command);
    } else {
      if (!pageGrouped[group]) {
        pageGrouped[group] = [];
      }
      pageGrouped[group].push(command);
    }
  });

  const sortedPageGroups = Object.keys(pageGrouped).sort((a, b) =>
    a.localeCompare(b),
  );

  // Filter context and global commands separately (when not on a page)
  const filteredContextCommands = contextCommands.filter(filterCommand);
  const filteredGlobalCommands = globalCommands.filter(filterCommand);

  // Separate grouped vs ungrouped for context commands
  const contextUngrouped: Command[] = [];
  const contextGrouped: Record<string, Command[]> = {};
  filteredContextCommands.forEach((command) => {
    const group = command.group ?? "";
    if (group === "") {
      contextUngrouped.push(command);
    } else {
      if (!contextGrouped[group]) {
        contextGrouped[group] = [];
      }
      contextGrouped[group].push(command);
    }
  });

  // Separate grouped vs ungrouped for global commands
  const globalUngrouped: Command[] = [];
  const globalGrouped: Record<string, Command[]> = {};
  filteredGlobalCommands.forEach((command) => {
    const group = command.group ?? "";
    if (group === "") {
      globalUngrouped.push(command);
    } else {
      if (!globalGrouped[group]) {
        globalGrouped[group] = [];
      }
      globalGrouped[group].push(command);
    }
  });

  // Sort grouped commands alphabetically
  const sortedContextGroups = Object.keys(contextGrouped).sort((a, b) =>
    a.localeCompare(b),
  );
  const sortedGlobalGroups = Object.keys(globalGrouped).sort((a, b) =>
    a.localeCompare(b),
  );

  const renderCommand = (command: Command) => {
    return (
      <CommandItem
        key={command.id}
        disabled={command.disabled}
        onSelect={() => handleCommandSelect(command)}
      >
        {command.icon}
        <span>{command.label}</span>
        <CommandTrail>
          {command.shortcut && <CommandShortcut keybind={command.shortcut} />}
          {(command as PageCommand).pageId && <ChevronRight />}
        </CommandTrail>
      </CommandItem>
    );
  };

  return (
    <>
      <RootCommands />
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        render={
          <motion.div
            key={animationKey}
            animate={{
              scale: animationKey > 0 ? [1, 0.99, 1] : 1,
            }}
            transition={{
              duration: 0.15,
              ease: "easeOut",
            }}
          />
        }
      >
        <CommandInput
          placeholder={
            currentPage
              ? `${currentPage.label}...`
              : "Type a command or search..."
          }
          value={search}
          onValueChange={setSearch}
          onKeyDown={handleKeyDown}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {currentPageId ? (
            pageUngrouped.length > 0 && (
              <>
                <CommandGroup>
                  {pageUngrouped.map((command) => renderCommand(command))}
                </CommandGroup>
                {/* Grouped page commands */}
                {sortedPageGroups.map((groupName) => (
                  <CommandGroup key={groupName} heading={groupName}>
                    {pageGrouped[groupName].map((command) =>
                      renderCommand(command),
                    )}
                  </CommandGroup>
                ))}
              </>
            )
          ) : (
            <>
              {/* 1. Ungrouped context commands */}
              {contextUngrouped.length > 0 && (
                <CommandGroup>
                  {contextUngrouped.map((command) => renderCommand(command))}
                </CommandGroup>
              )}
              {/* 2. Grouped context commands */}
              {sortedContextGroups.map((groupName) => (
                <CommandGroup key={groupName} heading={groupName}>
                  {contextGrouped[groupName].map((command) =>
                    renderCommand(command),
                  )}
                </CommandGroup>
              ))}
              {/* 3. Ungrouped global commands */}
              {globalUngrouped.length > 0 && (
                <CommandGroup>
                  {globalUngrouped.map((command) => renderCommand(command))}
                </CommandGroup>
              )}
              {/* 4. Grouped global commands */}
              {sortedGlobalGroups.map((groupName) => (
                <CommandGroup key={groupName} heading={groupName}>
                  {globalGrouped[groupName].map((command) =>
                    renderCommand(command),
                  )}
                </CommandGroup>
              ))}
            </>
          )}
        </CommandList>
        <CommandFooter>
          {currentPage ? (
            <>
              Press <Keybind keybind="backspace" /> to go back •{" "}
              <Keybind keybind="esc" /> to close
            </>
          ) : (
            <>
              Press <Keybind keybind="esc" /> to close •{" "}
              <Keybind keybind="mod+k" /> to open
            </>
          )}
        </CommandFooter>
      </CommandDialog>
    </>
  );
};
