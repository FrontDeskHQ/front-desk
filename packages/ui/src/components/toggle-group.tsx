"use client";

import { Toggle as BaseToggle } from "@base-ui/react/toggle";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import * as React from "react";

type ToggleGroupSize = "sm" | "default" | "lg";

const ToggleGroupContext = React.createContext<{
  size: ToggleGroupSize;
}>({
  size: "default",
});

const sizeClasses: Record<ToggleGroupSize, string> = {
  default: "h-9",
  lg: "h-10",
  sm: "h-8",
};

function ToggleGroup({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof BaseToggleGroup> & {
  size?: ToggleGroupSize;
}) {
  return (
    <ToggleGroupContext.Provider value={{ size }}>
      <BaseToggleGroup
        data-slot="toggle-group"
        data-size={size}
        className={cn(
          "bg-muted text-muted-foreground border-input inline-flex w-fit items-center justify-center rounded-md border",
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {children}
      </BaseToggleGroup>
    </ToggleGroupContext.Provider>
  );
}

function ToggleGroupItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof BaseToggle>) {
  const { size } = React.useContext(ToggleGroupContext);

  return (
    <BaseToggle
      data-slot="toggle-group-item"
      data-size={size}
      className={cn(
        "data-[pressed]:bg-background-primary data-[pressed]:border-input data-[pressed]:text-foreground-primary hover:text-foreground-primary focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[pressed]:bg-input/30 text-foreground-secondary disabled:text-foreground-secondary/80 relative inline-flex h-full flex-1 items-center justify-center gap-1.5 border border-transparent px-3 py-1 text-sm whitespace-nowrap focus-visible:z-10 focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 rounded-md not-first:-ml-0.5 data-[pressed]:z-10 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
    </BaseToggle>
  );
}

export { ToggleGroup, ToggleGroupItem };
