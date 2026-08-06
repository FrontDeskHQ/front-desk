import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandItemCheckbox,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  CommandTrail,
} from "@workspace/ui/components/command";
import { Keybind } from "@workspace/ui/components/keybind";
import { FileText, Home, Settings, User } from "lucide-react";
import { useState } from "react";

import {
  Anatomy,
  Demo,
  DocPage,
  DocSection,
  PropsTable,
} from "./-components/doc-kit";
import type { ComponentMeta } from "./-components/doc-kit";

export const meta: ComponentMeta = {
  description:
    "A searchable command list and dialog with grouped actions, keyboard navigation, and an optional checkbox-based multi-select mode.",
  import:
    'import { CommandDialog, CommandInput, CommandItem, CommandItemCheckbox } from "@workspace/ui/components/command";',
  name: "Command",
  related: ["Dialog", "Combobox", "Select", "Keybind"],
  status: "stable",
  whenNotToUse: [
    "Choosing one value from a fixed form field — use Select or RadioGroup.",
    "Entering or editing data — use form controls such as Input and Checkbox.",
    "A short menu without search — use DropdownMenu.",
  ],
  whenToUse: [
    "Running actions or navigating from a searchable command palette.",
    "Choosing several searchable options where checkbox clicks and Space should keep the dialog open.",
    "Grouping a longer action set while preserving arrow-key navigation and shortcuts.",
  ],
};

export const Route = createFileRoute("/command" as unknown as "/command")({
  component: RouteComponent,
});

function CommandDialogDemo() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open command palette</Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search commands..." />
        <CommandList>
          <CommandEmpty>No commands found.</CommandEmpty>
          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => setOpen(false)}>
              <Home />
              <span>Home</span>
              <CommandShortcut keybind="mod+h" />
            </CommandItem>
            <CommandItem onSelect={() => setOpen(false)}>
              <Settings />
              <span>Settings</span>
              <CommandShortcut keybind="mod+," />
            </CommandItem>
          </CommandGroup>
        </CommandList>
        <CommandFooter>
          Press <Keybind keybind="esc" /> to close
        </CommandFooter>
      </CommandDialog>
    </>
  );
}

function MultiSelectDemo() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(["billing"]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => setOpen(true)}>Assign topics</Button>
      <span className="text-foreground-secondary text-sm">
        {selected.length > 0 ? selected.join(", ") : "No topics selected"}
      </span>
      <CommandDialog
        multiple
        open={open}
        onOpenChange={setOpen}
        value={selected}
        onValueChange={setSelected}
      >
        <CommandInput placeholder="Search topics..." />
        <CommandList>
          <CommandEmpty>No topics found.</CommandEmpty>
          <CommandGroup heading="Topics">
            <CommandItem value="billing">
              <CommandItemCheckbox aria-label="Toggle Billing" />
              <span>Billing</span>
            </CommandItem>
            <CommandItem value="product">
              <CommandItemCheckbox aria-label="Toggle Product" />
              <span>Product</span>
            </CommandItem>
            <CommandItem value="security">
              <CommandItemCheckbox aria-label="Toggle Security" />
              <span>Security</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
        <CommandFooter className="justify-end gap-3">
          <span className="flex items-center gap-1">
            <Keybind keybind="space" /> Toggle
          </span>
          <span className="flex items-center gap-1">
            <Keybind keybind="enter" /> Toggle and close
          </span>
        </CommandFooter>
      </CommandDialog>
    </div>
  );
}

function RouteComponent() {
  return (
    <DocPage meta={meta}>
      <DocSection
        title="Inline"
        description="Compose an inline searchable list from explicit groups, items, trails, and separators."
      >
        <Demo
          code={`<Command className="max-w-md rounded-md border">
  <CommandInput placeholder="Search files..." />
  <CommandList>
    <CommandEmpty>No files found.</CommandEmpty>
    <CommandGroup heading="Recent">
      <CommandItem>
        <FileText />
        <span>Quarterly report</span>
        <CommandTrail>
          <CommandShortcut keybind="mod+1" />
        </CommandTrail>
      </CommandItem>
      <CommandItem disabled>
        <FileText />
        <span>Archived notes</span>
      </CommandItem>
    </CommandGroup>
    <CommandSeparator />
    <CommandGroup heading="People">
      <CommandItem>
        <User />
        <span>Pedro Costa</span>
      </CommandItem>
    </CommandGroup>
  </CommandList>
</Command>`}
        >
          <Command className="max-w-md rounded-md border">
            <CommandInput placeholder="Search files..." />
            <CommandList>
              <CommandEmpty>No files found.</CommandEmpty>
              <CommandGroup heading="Recent">
                <CommandItem>
                  <FileText />
                  <span>Quarterly report</span>
                  <CommandTrail>
                    <CommandShortcut keybind="mod+1" />
                  </CommandTrail>
                </CommandItem>
                <CommandItem disabled>
                  <FileText />
                  <span>Archived notes</span>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="People">
                <CommandItem>
                  <User />
                  <span>Pedro Costa</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </Demo>
      </DocSection>

      <DocSection
        title="Dialog"
        description="Single-select commands keep their existing explicit close behavior: close the controlled dialog from onSelect when the action completes."
      >
        <Demo
          code={`const [open, setOpen] = useState(false);

<>
  <Button onClick={() => setOpen(true)}>Open command palette</Button>
  <CommandDialog open={open} onOpenChange={setOpen}>
    <CommandInput placeholder="Search commands..." />
    <CommandList>
      <CommandEmpty>No commands found.</CommandEmpty>
      <CommandGroup heading="Navigation">
        <CommandItem onSelect={() => setOpen(false)}>
          <Home />
          <span>Home</span>
          <CommandShortcut keybind="mod+h" />
        </CommandItem>
        <CommandItem onSelect={() => setOpen(false)}>
          <Settings />
          <span>Settings</span>
          <CommandShortcut keybind="mod+," />
        </CommandItem>
      </CommandGroup>
    </CommandList>
    <CommandFooter>
      Press <Keybind keybind="esc" /> to close
    </CommandFooter>
  </CommandDialog>
</>`}
        >
          <CommandDialogDemo />
        </Demo>
      </DocSection>

      <DocSection
        title="Multi-select"
        description="Click an item or press Enter to toggle it and close. Click its checkbox or press Space to toggle it and keep the dialog open. Every checkbox item needs an explicit value."
      >
        <Demo
          code={`const [open, setOpen] = useState(false);
const [selected, setSelected] = useState(["billing"]);

<div className="flex flex-wrap items-center gap-3">
  <Button onClick={() => setOpen(true)}>Assign topics</Button>
  <span className="text-foreground-secondary text-sm">
    {selected.length > 0 ? selected.join(", ") : "No topics selected"}
  </span>
  <CommandDialog
    multiple
    open={open}
    onOpenChange={setOpen}
    value={selected}
    onValueChange={setSelected}
  >
    <CommandInput placeholder="Search topics..." />
    <CommandList>
      <CommandEmpty>No topics found.</CommandEmpty>
      <CommandGroup heading="Topics">
        <CommandItem value="billing">
          <CommandItemCheckbox aria-label="Toggle Billing" />
          <span>Billing</span>
        </CommandItem>
        <CommandItem value="product">
          <CommandItemCheckbox aria-label="Toggle Product" />
          <span>Product</span>
        </CommandItem>
        <CommandItem value="security">
          <CommandItemCheckbox aria-label="Toggle Security" />
          <span>Security</span>
        </CommandItem>
      </CommandGroup>
    </CommandList>
    <CommandFooter className="justify-end gap-3">
      <span className="flex items-center gap-1">
        <Keybind keybind="space" /> Toggle
      </span>
      <span className="flex items-center gap-1">
        <Keybind keybind="enter" /> Toggle and close
      </span>
    </CommandFooter>
  </CommandDialog>
</div>`}
        >
          <MultiSelectDemo />
        </Demo>
      </DocSection>

      <DocSection
        title="CommandDialog API"
        description="Props in addition to the Base UI Dialog root props."
      >
        <PropsTable
          rows={[
            {
              default: "false",
              description:
                "Enables checkbox multi-selection, Space-to-toggle, and automatic close after item click or Enter.",
              name: "multiple",
              type: "boolean",
            },
            {
              description:
                "Selected item values in controlled multi-select mode.",
              name: "value",
              type: "string[]",
            },
            {
              default: "[]",
              description:
                "Initially selected item values in uncontrolled multi-select mode.",
              name: "defaultValue",
              type: "string[]",
            },
            {
              description:
                "Called with the next selected value array whenever an item is toggled.",
              name: "onValueChange",
              type: "(value: string[]) => void",
            },
            {
              default: '"Command Palette"',
              description:
                "Accessible dialog title, visually hidden by default.",
              name: "title",
              type: "string",
            },
            {
              default: '"Search for a command to run..."',
              description:
                "Accessible dialog description, visually hidden by default.",
              name: "description",
              type: "string",
            },
            {
              default: "false",
              description: "Shows the dialog close button.",
              name: "showCloseButton",
              type: "boolean",
            },
          ]}
        />
      </DocSection>

      <DocSection
        title="Item API"
        description="CommandItem and CommandItemCheckbox props in addition to their underlying cmdk Item and Checkbox props."
      >
        <PropsTable
          rows={[
            {
              description:
                "Stable item identifier. Required when the item contains CommandItemCheckbox.",
              name: "value (CommandItem)",
              type: "string",
            },
            {
              description:
                "Runs after selection. In multi-select mode, the value array is updated before this callback.",
              name: "onSelect (CommandItem)",
              type: "(value: string) => void",
            },
            {
              default: "false",
              description:
                "Excludes the item from pointer and keyboard selection.",
              name: "disabled (CommandItem)",
              type: "boolean",
            },
            {
              description:
                "Accessible name for the checkbox. Defaults to the item value; provide a human-readable label.",
              name: "aria-label (CommandItemCheckbox)",
              type: "string",
            },
          ]}
        />
      </DocSection>

      <DocSection
        title="Anatomy"
        description="Checkboxes are explicit item slots; omit them for ordinary command items."
      >
        <Anatomy
          code={`<CommandDialog multiple value={value} onValueChange={setValue}>
  <CommandInput />
  <CommandList>
    <CommandEmpty />
    <CommandGroup>
      <CommandItem value="option">
        <CommandItemCheckbox aria-label="Toggle option" />
        <span>Option</span>
        <CommandTrail>
          <CommandShortcut keybind="mod+1" />
        </CommandTrail>
      </CommandItem>
    </CommandGroup>
  </CommandList>
  <CommandFooter />
</CommandDialog>`}
        />
      </DocSection>
    </DocPage>
  );
}
