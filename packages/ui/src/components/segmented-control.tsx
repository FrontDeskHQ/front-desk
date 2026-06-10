"use client";

import { Toggle as BaseToggle } from "@base-ui/react/toggle";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, useReducedMotion } from "motion/react";
import * as React from "react";

type SegmentedControlSize = "sm" | "md" | "lg";

const SegmentedControlContext = React.createContext<{
  size: SegmentedControlSize;
  selectedValue?: string;
  // Shared layoutId so the highlight animates between segments; unique per
  // control instance so multiple controls on a page don't fight over it.
  layoutId: string;
}>({ size: "md", layoutId: "segmented-control" });

const segmentedControlVariants = cva(
  "inline-flex w-fit items-center justify-center gap-0.5 rounded-md border bg-muted p-0.5 text-muted-foreground data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch",
  {
    variants: {
      // Sizing is driven by the items so the track hugs their height; the
      // variant exists so the size flows through context to each item.
      size: { sm: "", md: "", lg: "" },
    },
    defaultVariants: { size: "md" },
  },
);

const segmentedControlItemVariants = cva(
  // Segments size to their content by default. Add `flex-1` on items for an
  // equal-width control.
  "relative inline-flex items-center justify-center gap-1.5 rounded-sm whitespace-nowrap text-foreground-secondary transition-colors outline-none select-none hover:text-foreground-primary focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[pressed]:text-foreground-primary [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      size: {
        sm: "h-7 px-2.5 text-xs",
        md: "h-8 px-3 text-sm",
        lg: "h-9 px-4 text-sm",
      },
    },
    defaultVariants: { size: "md" },
  },
);

// Minimal controllable-state helper so the control can run uncontrolled while
// still guaranteeing exactly one segment stays selected (deselection is
// swallowed below).
function useControllableValue(
  controlled: string | undefined,
  defaultValue: string | undefined,
) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const isControlled = controlled !== undefined;
  const value = isControlled ? controlled : uncontrolled;
  const setValue = React.useCallback(
    (next: string) => {
      if (!isControlled) setUncontrolled(next);
    },
    [isControlled],
  );
  return [value, setValue] as const;
}

type SegmentedControlProps = Omit<
  BaseToggleGroup.Props<string>,
  "value" | "defaultValue" | "onValueChange" | "multiple"
> &
  VariantProps<typeof segmentedControlVariants> & {
    /** The selected segment value (controlled). */
    value?: string;
    /** The initially selected segment value (uncontrolled). */
    defaultValue?: string;
    /** Fired with the newly selected value. Never fires with an empty value. */
    onValueChange?: (
      value: string,
      details: BaseToggleGroup.ChangeEventDetails,
    ) => void;
  };

function SegmentedControl({
  className,
  size = "md",
  value,
  defaultValue,
  onValueChange,
  ...props
}: SegmentedControlProps) {
  const [current, setCurrent] = useControllableValue(value, defaultValue);
  const layoutId = React.useId();

  return (
    <SegmentedControlContext.Provider
      value={{ size: size ?? "md", selectedValue: current, layoutId }}
    >
      <BaseToggleGroup
        data-slot="segmented-control"
        data-size={size}
        value={current === undefined ? undefined : [current]}
        onValueChange={(group, details) => {
          const next = group[0];
          // A segmented control always keeps one segment selected — ignore the
          // deselect that Base UI fires when the active segment is re-pressed.
          if (next === undefined) return;
          setCurrent(next);
          onValueChange?.(next, details);
        }}
        className={cn(segmentedControlVariants({ size, className }))}
        {...props}
      />
    </SegmentedControlContext.Provider>
  );
}

type SegmentedControlItemProps = BaseToggle.Props<string>;

function SegmentedControlItem({
  className,
  children,
  value: itemValue,
  ...props
}: SegmentedControlItemProps) {
  const { size, selectedValue, layoutId } = React.useContext(
    SegmentedControlContext,
  );
  const isSelected = itemValue !== undefined && itemValue === selectedValue;
  const shouldReduceMotion = useReducedMotion();

  return (
    <BaseToggle
      data-slot="segmented-control-item"
      data-size={size}
      data-composite-item-active={isSelected ? "" : undefined}
      className={cn(segmentedControlItemVariants({ size }), className)}
      value={itemValue}
      {...props}
    >
      {isSelected && (
        <motion.span
          layoutId={layoutId}
          aria-hidden
          className="absolute inset-0 z-0 rounded-sm bg-background-primary shadow-sm dark:bg-input/50"
          // The highlight is already on screen and moving between segments, so
          // a subtle spring (low bounce) reads as native. Snap instantly when
          // the user prefers reduced motion.
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { type: "spring", duration: 0.25, bounce: 0.15 }
          }
        />
      )}
      <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
        {children}
      </span>
    </BaseToggle>
  );
}

export {
  SegmentedControl,
  SegmentedControlItem,
  segmentedControlVariants,
  segmentedControlItemVariants,
};
