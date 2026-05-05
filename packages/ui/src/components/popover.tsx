"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@workspace/ui/lib/utils";
import * as React from "react";

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  positionerProps,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Popup> & {
  positionerProps?: React.ComponentProps<typeof PopoverPrimitive.Positioner>;
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align="center"
        sideOffset={4}
        {...positionerProps}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "bg-popover text-popover-foreground transition-[transform,scale,opacity] data-[ending-style]:scale-90 data-[ending-style]:opacity-0 data-[starting-style]:scale-90 data-[starting-style]:opacity-0 z-50 min-w-72 w-fit origin-[var(--transform-origin)] rounded-md border p-4 shadow-md outline-hidden",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
