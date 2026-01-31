import { Button } from "@/components/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/command";
import { Keybind } from "@/components/keybind";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarIcon,
  FileIcon,
  HomeIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/command")({
  component: RouteComponent,
});

function RouteComponent() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      <div className="text-lg">Command</div>

      {/* Basic Command */}
      <div className="flex flex-col gap-4">
        <div className="text-sm">Basic Command</div>
        <div className="border rounded-md p-4 border-dashed">
          <Command className="max-w-md">
            <CommandInput placeholder="Type a command or search..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Suggestions">
                <CommandItem>
                  <CalendarIcon />
                  <span>Calendar</span>
                </CommandItem>
                <CommandItem>
                  <FileIcon />
                  <span>Search Emoji</span>
                </CommandItem>
                <CommandItem>
                  <UserIcon />
                  <span>Calculator</span>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Settings">
                <CommandItem>
                  <SettingsIcon />
                  <span>Profile</span>
                  <CommandShortcut keybind="mod+p" />
                </CommandItem>
                <CommandItem>
                  <SettingsIcon />
                  <span>Mail</span>
                  <CommandShortcut keybind="mod+b" />
                </CommandItem>
                <CommandItem>
                  <SettingsIcon />
                  <span>Settings</span>
                  <CommandShortcut keybind="mod+s" />
                </CommandItem>
              </CommandGroup>
            </CommandList>
            <CommandFooter>
              Press <Keybind keybind="esc" /> to close
            </CommandFooter>
          </Command>
        </div>
      </div>

      {/* Command Dialog */}
      <div className="flex flex-col gap-4">
        <div className="text-sm">Command Dialog</div>
        <div className="border rounded-md p-4 border-dashed flex items-center gap-4">
          <Button onClick={() => setOpen(true)}>Open Command Palette</Button>
          <CommandDialog open={open} onOpenChange={setOpen}>
            <CommandInput placeholder="Type a command or search..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Navigation">
                <CommandItem>
                  <HomeIcon />
                  <span>Home</span>
                  <CommandShortcut keybind="mod+h" />
                </CommandItem>
                <CommandItem>
                  <SearchIcon />
                  <span>Search</span>
                  <CommandShortcut keybind="mod+k" />
                </CommandItem>
                <CommandItem>
                  <FileIcon />
                  <span>Files</span>
                  <CommandShortcut keybind="mod+f" />
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Account">
                <CommandItem>
                  <UserIcon />
                  <span>Profile</span>
                  <CommandShortcut keybind="mod+p" />
                </CommandItem>
                <CommandItem>
                  <SettingsIcon />
                  <span>Settings</span>
                  <CommandShortcut keybind="mod+s" />
                </CommandItem>
              </CommandGroup>
            </CommandList>
            <CommandFooter>
              Press <Keybind keybind="esc" /> to close
            </CommandFooter>
          </CommandDialog>
        </div>
      </div>

      {/* Command with Multiple Groups */}
      <div className="flex flex-col gap-4">
        <div className="text-sm">Multiple Groups</div>
        <div className="border rounded-md p-4 border-dashed">
          <Command className="max-w-md">
            <CommandInput placeholder="Search commands..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Recent">
                <CommandItem>
                  <FileIcon />
                  <span>Document 1</span>
                </CommandItem>
                <CommandItem>
                  <FileIcon />
                  <span>Document 2</span>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Favorites">
                <CommandItem>
                  <HomeIcon />
                  <span>Dashboard</span>
                </CommandItem>
                <CommandItem>
                  <SettingsIcon />
                  <span>Configuration</span>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Actions">
                <CommandItem>
                  <FileIcon />
                  <span>New File</span>
                  <CommandShortcut keybind="mod+n" />
                </CommandItem>
                <CommandItem>
                  <FileIcon />
                  <span>Open File</span>
                  <CommandShortcut keybind="mod+o" />
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </div>

      {/* Command with Disabled Items */}
      <div className="flex flex-col gap-4">
        <div className="text-sm">Disabled Items</div>
        <div className="border rounded-md p-4 border-dashed">
          <Command className="max-w-md">
            <CommandInput placeholder="Type a command or search..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Available">
                <CommandItem>
                  <CalendarIcon />
                  <span>Calendar</span>
                </CommandItem>
                <CommandItem disabled>
                  <FileIcon />
                  <span>Search Emoji (Disabled)</span>
                </CommandItem>
                <CommandItem>
                  <UserIcon />
                  <span>Calculator</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </div>

      {/* Command Empty State */}
      <div className="flex flex-col gap-4">
        <div className="text-sm">Empty State</div>
        <div className="border rounded-md p-4 border-dashed">
          <Command className="max-w-md">
            <CommandInput placeholder="Type 'xyz' to see empty state..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
            </CommandList>
          </Command>
        </div>
      </div>

      {/* Command Footer */}
      <div className="flex flex-col gap-4">
        <div className="text-sm">Command Footer</div>
        <div className="border rounded-md p-4 border-dashed">
          <Command className="max-w-md">
            <CommandInput placeholder="Type a command or search..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Navigation">
                <CommandItem>
                  <HomeIcon />
                  <span>Home</span>
                </CommandItem>
                <CommandItem>
                  <SearchIcon />
                  <span>Search</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
            <CommandFooter>
              <div className="flex items-center justify-between">
                <span>Use arrow keys to navigate</span>
                <div className="flex items-center gap-2">
                  <span>Select:</span>
                  <CommandShortcut keybind="enter" />
                </div>
              </div>
            </CommandFooter>
          </Command>
        </div>
        <div className="border rounded-md p-4 border-dashed">
          <Command className="max-w-md">
            <CommandInput placeholder="Type a command or search..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Actions">
                <CommandItem>
                  <FileIcon />
                  <span>New File</span>
                  <CommandShortcut keybind="mod+n" />
                </CommandItem>
                <CommandItem>
                  <FileIcon />
                  <span>Open File</span>
                  <CommandShortcut keybind="mod+o" />
                </CommandItem>
              </CommandGroup>
            </CommandList>
            <CommandFooter>
              Press <Keybind keybind="esc" /> to close •{" "}
              <Keybind keybind="mod+k" /> to open
            </CommandFooter>
          </Command>
        </div>
      </div>

      {/* Usage Guidelines */}
      <div className="flex flex-col gap-4">
        <div className="text-lg">Usage Guidelines</div>
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="text-sm font-medium">Overview</div>
            <div className="text-sm space-y-2">
              <p>
                The{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  Command
                </code>{" "}
                component provides a command palette interface for quick actions
                and navigation. It's built on top of{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  cmdk
                </code>{" "}
                and offers keyboard navigation, search, and grouping
                capabilities.
              </p>
              <p>
                Use{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  CommandDialog
                </code>{" "}
                for modal command palettes that overlay the entire screen, or
                use{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  Command
                </code>{" "}
                directly for inline command interfaces.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">Component Structure</div>
            <div className="text-sm space-y-2">
              <ul className="text-sm space-y-1.5 list-disc list-inside">
                <li>
                  <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                    Command
                  </code>{" "}
                  - Base container component
                </li>
                <li>
                  <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                    CommandDialog
                  </code>{" "}
                  - Dialog wrapper with built-in modal behavior
                </li>
                <li>
                  <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                    CommandInput
                  </code>{" "}
                  - Search input field with icon
                </li>
                <li>
                  <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                    CommandList
                  </code>{" "}
                  - Scrollable list container
                </li>
                <li>
                  <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                    CommandEmpty
                  </code>{" "}
                  - Empty state when no results found
                </li>
                <li>
                  <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                    CommandGroup
                  </code>{" "}
                  - Group items with optional heading
                </li>
                <li>
                  <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                    CommandItem
                  </code>{" "}
                  - Individual command item
                </li>
                <li>
                  <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                    CommandSeparator
                  </code>{" "}
                  - Visual separator between groups
                </li>
                <li>
                  <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                    CommandShortcut
                  </code>{" "}
                  - Display keyboard shortcuts
                </li>
                <li>
                  <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                    CommandFooter
                  </code>{" "}
                  - Footer section for hints, tips, or additional information
                </li>
              </ul>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">Do's ✓</div>
            <ul className="text-sm space-y-1.5 list-disc list-inside">
              <li>
                Use CommandDialog for global command palettes (typically
                triggered by ⌘K or Ctrl+K)
              </li>
              <li>
                Use Command for inline search interfaces (e.g., comboboxes,
                search bars)
              </li>
              <li>
                Group related commands together using CommandGroup with
                descriptive headings
              </li>
              <li>
                Use CommandShortcut to display keyboard shortcuts for common
                actions
              </li>
              <li>
                Use CommandFooter to display helpful hints, keyboard shortcuts,
                or additional context at the bottom of the command palette
              </li>
              <li>
                Always include CommandEmpty to show a helpful message when no
                results are found
              </li>
              <li>
                Use icons in CommandItem to provide visual context and improve
                scanability
              </li>
              <li>
                Use CommandSeparator to visually separate different groups of
                commands
              </li>
              <li>
                Disable items using the disabled prop rather than hiding them
                when users should be aware of unavailable actions
              </li>
              <li>
                Provide descriptive placeholder text in CommandInput to guide
                users
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">Don'ts ✗</div>
            <ul className="text-sm space-y-1.5 list-disc list-inside">
              <li>
                Don't use CommandDialog for simple dropdown menus - use Select
                or Combobox instead
              </li>
              <li>
                Don't nest Command components - use CommandGroup for
                organization instead
              </li>
              <li>
                Don't use CommandItem without proper keyboard navigation support
              </li>
              <li>
                Don't create overly deep nesting - keep command structure flat
                and scannable
              </li>
              <li>
                Don't use Command for forms or data entry - it's designed for
                command execution and navigation
              </li>
              <li>
                Don't forget to handle the onSelect event for CommandItem to
                execute actions
              </li>
              <li>
                Don't use CommandDialog without proper open/close state
                management
              </li>
              <li>
                Avoid using too many groups - keep the structure simple and
                intuitive
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">Accessibility</div>
            <ul className="text-sm space-y-1.5 list-disc list-inside">
              <li>
                Command components are fully keyboard accessible - use Arrow
                keys to navigate, Enter to select, Escape to close
              </li>
              <li>
                Search functionality filters items automatically as you type
              </li>
              <li>
                Focus management is handled automatically when opening
                CommandDialog
              </li>
              <li>
                Use aria-label on CommandInput if the placeholder doesn't
                provide sufficient context
              </li>
              <li>
                Disabled items are automatically excluded from keyboard
                navigation
              </li>
              <li>
                CommandDialog includes proper ARIA attributes for modal dialogs
              </li>
              <li>
                Screen readers will announce group headings and item labels
                appropriately
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
