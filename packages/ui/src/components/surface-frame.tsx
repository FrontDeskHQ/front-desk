import { useRender } from "@base-ui/react/use-render";
import { cn } from "@workspace/ui/lib/utils";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";

const surfaceFrameVariants = cva(
  "surface-frame relative bg-background-primary text-foreground-primary",
  {
    defaultVariants: {
      bevel: "subtle",
      elevation: "sm",
      halo: "none",
      radius: "xl",
    },
    variants: {
      bevel: {
        none: "surface-frame-bevel-none",
        subtle: "surface-frame-bevel-subtle",
        strong: "surface-frame-bevel-strong",
      },
      elevation: {
        none: "surface-frame-elevation-none",
        sm: "surface-frame-elevation-sm",
        md: "surface-frame-elevation-md",
        lg: "surface-frame-elevation-lg",
      },
      halo: {
        none: "surface-frame-halo-none",
        subtle: "surface-frame-halo-subtle",
        default: "surface-frame-halo-default",
        strong: "surface-frame-halo-strong",
      },
      radius: {
        none: "rounded-none",
        sm: "rounded-sm",
        md: "rounded-md",
        lg: "rounded-lg",
        xl: "rounded-xl",
        full: "rounded-full",
      },
    },
  }
);

type SurfaceFrameProps = useRender.ComponentProps<"div"> &
  VariantProps<typeof surfaceFrameVariants>;

const SurfaceFrame = React.forwardRef<HTMLElement, SurfaceFrameProps>(
  ({ bevel, className, elevation, halo, radius, render, ...props }, ref) =>
    useRender({
      defaultTagName: "div",
      props: {
        ...props,
        className: cn(
          surfaceFrameVariants({ bevel, className, elevation, halo, radius })
        ),
        "data-slot": "surface-frame",
      },
      ref,
      render,
    })
);

SurfaceFrame.displayName = "SurfaceFrame";

export { SurfaceFrame, surfaceFrameVariants };
export type { SurfaceFrameProps };
