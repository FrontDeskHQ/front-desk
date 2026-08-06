"use client";

import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Keybind } from "@workspace/ui/components/keybind";
import { cn } from "@workspace/ui/lib/utils";
import { Command as CommandPrimitive } from "cmdk";
import * as React from "react";

interface CommandSelectionContextValue {
  close: () => void;
  multiple: boolean;
  selectedValues: Set<string>;
  toggle: (value: string) => void;
}

const CommandSelectionContext = React.createContext<
  CommandSelectionContextValue | undefined
>(undefined);

interface CommandItemContextValue {
  selectWithoutClosing: () => void;
  value?: string;
}

const CommandItemContext = React.createContext<
  CommandItemContextValue | undefined
>(undefined);

function Command({
  className,
  onKeyDown,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  const selection = React.useContext(CommandSelectionContext);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);

      if (
        event.defaultPrevented ||
        !selection?.multiple ||
        event.key !== " " ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      const selectedItem = event.currentTarget.querySelector<HTMLElement>(
        '[cmdk-item][aria-selected="true"]'
      );
      const checkbox = selectedItem?.querySelector<HTMLButtonElement>(
        '[data-slot="command-item-checkbox"]'
      );

      if (checkbox) {
        event.preventDefault();
        checkbox.click();
      }
    },
    [onKeyDown, selection]
  );

  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
        className
      )}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

type CommandDialogProps = Omit<
  React.ComponentProps<typeof Dialog>,
  "children"
> & {
  children?: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
  render?: React.ComponentProps<typeof DialogContent>["render"];
  multiple?: boolean;
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
};

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = false,
  render,
  multiple = false,
  value,
  defaultValue = [],
  onValueChange,
  actionsRef,
  ...props
}: CommandDialogProps) {
  const dialogActionsRef = React.useRef<{
    close: () => void;
    unmount: () => void;
  } | null>(null);
  const [uncontrolledValue, setUncontrolledValue] =
    React.useState(defaultValue);
  const selectedValue = value ?? uncontrolledValue;
  const selectedValues = React.useMemo(
    () => new Set(selectedValue),
    [selectedValue]
  );

  React.useEffect(() => {
    if (!actionsRef) {
      return;
    }

    actionsRef.current = dialogActionsRef.current;

    return () => {
      actionsRef.current = null;
    };
  }, [actionsRef]);

  const close = React.useCallback(() => {
    dialogActionsRef.current?.close();
  }, []);

  const toggle = React.useCallback(
    (itemValue: string) => {
      const nextValue = selectedValues.has(itemValue)
        ? selectedValue.filter((entry) => entry !== itemValue)
        : [...selectedValue, itemValue];

      if (value === undefined) {
        setUncontrolledValue(nextValue);
      }
      onValueChange?.(nextValue);
    },
    [onValueChange, selectedValue, selectedValues, value]
  );

  const selectionContext = React.useMemo<CommandSelectionContextValue>(
    () => ({ close, multiple, selectedValues, toggle }),
    [close, multiple, selectedValues, toggle]
  );

  return (
    <CommandSelectionContext.Provider value={selectionContext}>
      <Dialog actionsRef={dialogActionsRef} {...props}>
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogContent
          className={cn(
            "overflow-hidden border-0 p-0 sm:max-w-xl shadow-xl rounded-none",
            className
          )}
          showCloseButton={showCloseButton}
          render={render}
          hideOverlay
        >
          <Command className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg:not([class*='size-'])]:size-4 border">
            {children}
          </Command>
        </DialogContent>
      </Dialog>
    </CommandSelectionContext.Provider>
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-9 items-center gap-2 border-b px-3"
    >
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
        className
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center text-sm text-foreground-secondary"
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
        className
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("bg-border -mx-1 h-px", className)}
      {...props}
    />
  );
}

function CommandItem({
  className,
  children,
  onSelect,
  value,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  const selection = React.useContext(CommandSelectionContext);

  const select = React.useCallback(
    (itemValue: string, close: boolean) => {
      if (selection?.multiple) {
        selection.toggle(itemValue);
      }
      onSelect?.(itemValue);
      if (selection?.multiple && close) {
        selection.close();
      }
    },
    [onSelect, selection]
  );

  const handleSelect = React.useCallback(
    (itemValue: string) => {
      select(itemValue, true);
    },
    [select]
  );

  const itemContext = React.useMemo<CommandItemContextValue>(
    () => ({
      selectWithoutClosing: () => {
        if (value === undefined) {
          throw new Error(
            "CommandItem requires a value when used with CommandItemCheckbox."
          );
        }
        select(value, false);
      },
      value,
    }),
    [select, value]
  );

  return (
    <CommandItemContext.Provider value={itemContext}>
      <CommandPrimitive.Item
        data-slot="command-item"
        className={cn(
          "group/command-item data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 h-9",
          className
        )}
        onSelect={handleSelect}
        value={value}
        {...props}
      >
        {children}
      </CommandPrimitive.Item>
    </CommandItemContext.Provider>
  );
}

function CommandItemCheckbox({
  "aria-label": ariaLabel,
  checked,
  className,
  onCheckedChange,
  onClick,
  tabIndex = -1,
  ...props
}: React.ComponentProps<typeof Checkbox>) {
  const item = React.useContext(CommandItemContext);
  const selection = React.useContext(CommandSelectionContext);

  if (!item) {
    throw new Error("CommandItemCheckbox must be used within CommandItem.");
  }

  const resolvedChecked =
    selection?.multiple && item.value !== undefined
      ? selection.selectedValues.has(item.value)
      : checked;

  const handleCheckedChange = React.useCallback(
    (nextChecked: boolean | "indeterminate") => {
      onCheckedChange?.(nextChecked);
      if (selection?.multiple) {
        item.selectWithoutClosing();
      }
    },
    [item, onCheckedChange, selection]
  );

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented) {
        event.stopPropagation();
      }
    },
    [onClick]
  );

  return (
    <Checkbox
      data-slot="command-item-checkbox"
      aria-label={ariaLabel ?? `Toggle ${item.value ?? "item"}`}
      checked={resolvedChecked}
      onCheckedChange={handleCheckedChange}
      onClick={handleClick}
      tabIndex={tabIndex}
      className={cn(
        "opacity-0 group-data-[selected=true]/command-item:opacity-100 data-[state=checked]:opacity-100",
        className
      )}
      {...props}
    />
  );
}

function CommandShortcut(props: React.ComponentProps<typeof Keybind>) {
  return <Keybind data-slot="command-shortcut" {...props} />;
}

function CommandTrail({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-trail"
      className={cn("flex items-center gap-2 ml-auto", className)}
      {...props}
    />
  );
}

function CommandFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-footer"
      className={cn("flex items-center border-t px-3 py-2 text-xs", className)}
      {...props}
    />
  );
}

export {
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
};
