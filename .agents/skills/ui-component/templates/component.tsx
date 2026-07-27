// Component skeleton — copy into packages/ui/src/components/<name>.tsx
// Replace `Thing`/`thing` with the component name. Delete what you don't need.
//
// Conventions (see REFERENCE.md):
// - Base UI ONLY. Build on a @base-ui/react primitive when one exists; for a
//   from-scratch element use the `useRender` hook. Never @radix-ui/* or Slot.
// - Variants via cva. Style with brand tokens (bg-background-*, text-foreground-*),
//   never raw hex except the established primary blue.
// - Every rendered element gets a `data-slot` attribute.
// - Forward className through cn(); spread the rest of props.
// - COMPOSE, don't configure: if the component has internal structure, expose
//   parts (Thing + ThingHeader + ThingBody) the caller arranges — not `title`/
//   `icon`/`footer` props. Allow element substitution via the `render` prop.
//   Share state between parts with context, never a fixed child order.

import { useRender } from "@base-ui/react/use-render";
import { cn } from "@workspace/ui/lib/utils";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";

const thingVariants = cva(
  // base classes shared by all variants
  "inline-flex items-center justify-center rounded-md text-sm transition outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  {
    defaultVariants: {
      size: "md",
      variant: "default",
    },
    variants: {
      size: {
        lg: "h-9 px-4",
        md: "h-7 px-3",
        sm: "h-6 px-2 text-xs",
      },
      variant: {
        default: "bg-background-secondary text-foreground-primary border",
        // add more variants here
      },
    },
  }
);

// `useRender.ComponentProps<"div">` includes the `render` prop, which lets
// callers swap the element (e.g. render Thing as a link) without losing styles.
type ThingProps = useRender.ComponentProps<"div"> &
  VariantProps<typeof thingVariants>;

function Thing({ className, variant, size, render, ...props }: ThingProps) {
  return useRender({
    defaultTagName: "div",
    props: {
      ...props,
      className: cn(thingVariants({ variant, size, className })),
      "data-slot": "thing",
    },
    render,
  });
}

// A part the caller composes inside <Thing>. Add as many as the structure needs
// (ThingHeader, ThingBody, ThingFooter) instead of content props on Thing.
// Each part forwards className + props and carries its own data-slot.
function ThingBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="thing-body"
      className={cn("flex flex-col gap-2 p-3", className)}
      {...props}
    />
  );
}

export { Thing, ThingBody, thingVariants };
