"use client";

import { Menu as MenuPrimitive } from "@base-ui-components/react/menu";
import { cn } from "@workspace/ui/lib/utils";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import * as React from "react";

function Menu({ ...props }: React.ComponentProps<typeof MenuPrimitive.Root>) {
  return <MenuPrimitive.Root data-slot="menu" {...props} />;
}

function MenuPortal({
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Portal>) {
  return <MenuPrimitive.Portal data-slot="menu-portal" {...props} />;
}

function MenuTrigger({
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Trigger>) {
  return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />;
}

function MenuContent({
  className,
  positionerProps,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Popup> & {
  positionerProps?: React.ComponentProps<typeof MenuPrimitive.Positioner>;
}) {
  return (
    <MenuPortal>
      <MenuPrimitive.Positioner
        sideOffset={4}
        align="start"
        disableAnchorTracking
        {...positionerProps}
      >
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(
            "origin-[var(--transform-origin)] transition-[transform,scale,opacity] data-[ending-style]:scale-90 data-[ending-style]:opacity-0 data-[starting-style]:scale-90 data-[starting-style]:opacity-0 bg-popover text-popover-foreground z-50 max-h-(--available-height) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md min-w-42",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPortal>
  );
}

function SubmenuContent({
  className,
  positionerProps,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Popup> & {
  positionerProps?: React.ComponentProps<typeof MenuPrimitive.Positioner>;
}) {
  return (
    <MenuContent
      className={className}
      positionerProps={{ ...positionerProps, alignOffset: -5, sideOffset: 0 }}
      {...props}
    />
  );
}

function MenuGroup({
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Group>) {
  return <MenuPrimitive.Group data-slot="menu-group" {...props} />;
}

function MenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function MenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.CheckboxItem>) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon className="size-4" />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

function MenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

function Submenu({
  ...props
}: React.ComponentProps<typeof MenuPrimitive.SubmenuRoot>) {
  return <MenuPrimitive.SubmenuRoot data-slot="submenu" {...props} />;
}

function SubmenuTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.SubmenuTrigger> & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="submenu-trigger"
      data-inset={inset}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[popup-open=true]:bg-accent data-[popup-open=true]:text-accent-foreground flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[inset]:pl-8 gap-2",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

export {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuPortal,
  MenuSeparator,
  MenuTrigger,
  Submenu,
  SubmenuContent,
  SubmenuTrigger,
};
