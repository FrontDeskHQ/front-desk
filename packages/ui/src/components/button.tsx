import { Button as BaseButton } from "@base-ui/react";
import { useKeybind } from "@workspace/ui/hooks/use-keybind";
import { cn } from "@workspace/ui/lib/utils";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { SquareArrowOutUpRight } from "lucide-react";
import * as React from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm transition-all outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    defaultVariants: {
      size: "md",
      variant: "primary",
    },
    variants: {
      size: {
        icon: "size-7",
        "icon-lg": "size-9",
        "icon-sm": "size-6 in-data-[slot=button-group]:rounded-md",
        "icon-xl": "size-10",
        lg: "h-9 px-4.5 has-[>svg:first-child]:pl-4 has-[>svg:last-child]:pr-4 font-medium",
        md: "h-7 px-3.5 has-[>svg:first-child]:pl-3 has-[>svg:last-child]:pr-3 text-sm",
        sm: "h-6 rounded-sm gap-1.5 px-2 text-xs in-data-[slot=button-group]:rounded-md has-[>svg:first-child]:pl-1.5 has-[>svg:last-child]:pr-1.5",
        xl: "h-10 rounded-md px-6 text-lg",
      },
      variant: {
        destructive:
          "surface-frame surface-frame-elevation-xs surface-frame-bevel-subtle bg-destructive text-white hover:bg-[oklch(from_var(--color-destructive)_calc(l-0.04)_c_h)] active:bg-[oklch(from_var(--color-destructive)_calc(l-0.08)_c_h)] active:surface-frame-elevation-none active:surface-frame-bevel-none dark:bg-destructive/60 dark:hover:bg-destructive/68 dark:active:bg-destructive/50 [--surface-frame-ring-color:color-mix(in_oklch,var(--color-destructive)_40%,transparent)]! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50",
        ghost:
          "hover:bg-[oklch(from_var(--color-accent)_calc(l-0.06)_c_h)] hover:text-accent-foreground active:bg-[oklch(from_var(--color-accent)_calc(l-0.08)_c_h)] aria-expanded:bg-accent aria-expanded:text-accent-foreground dark:hover:bg-accent/50 dark:active:bg-accent/40",
        link: "text-primary underline-offset-4 hover:underline",
        outline:
          "surface-frame surface-frame-elevation-xs surface-frame-bevel-none bg-transparent hover:bg-accent hover:text-accent-foreground active:bg-accent/60 active:surface-frame-elevation-none aria-expanded:bg-accent aria-expanded:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50 dark:active:bg-input/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50 aria-invalid:[--surface-frame-ring-color:var(--color-destructive)]",
        primary:
          "surface-frame surface-frame-elevation-xs surface-frame-bevel-subtle bg-brand text-background-primary dark:text-foreground-primary hover:bg-[oklch(from_var(--color-brand)_calc(l-0.04)_c_h)] active:bg-[oklch(from_var(--color-brand)_calc(l-0.08)_c_h)] active:surface-frame-elevation-none active:surface-frame-bevel-none dark:hover:bg-brand/90 dark:active:bg-brand/80 [--surface-frame-ring-color:color-mix(in_oklch,var(--color-brand)_60%,transparent)]! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50 aria-invalid:[--surface-frame-ring-color:var(--color-destructive)]",
        secondary:
          "surface-frame surface-frame-elevation-xs surface-frame-bevel-subtle bg-secondary text-secondary-foreground hover:bg-[oklch(from_var(--color-secondary)_calc(l-0.02)_c_h)] active:bg-[oklch(from_var(--color-secondary)_calc(l-0.035)_c_h)] active:surface-frame-elevation-none active:surface-frame-bevel-none dark:hover:bg-[oklch(from_var(--color-secondary)_calc(l+0.02)_c_h)] dark:active:bg-[oklch(from_var(--color-secondary)_calc(l+0.035)_c_h)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50 aria-invalid:[--surface-frame-ring-color:var(--color-destructive)]",
      },
    },
  }
);

type ButtonProps = React.ComponentProps<typeof BaseButton> &
  VariantProps<typeof buttonVariants> & {
    externalLink?: boolean;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      externalLink = false,
      children,
      render,
      ...props
    },
    ref
  ) => {
    const processChildren = (childNodes: React.ReactNode): React.ReactNode => {
      if (typeof childNodes === "string" || typeof childNodes === "number") {
        return <span>{childNodes}</span>;
      }

      if (Array.isArray(childNodes)) {
        return childNodes.map((child) => processChildren(child));
      }

      return childNodes;
    };

    const processedChildren = processChildren(children);

    return (
      <BaseButton
        data-slot="button"
        className={cn(buttonVariants({ className, size, variant }))}
        ref={ref}
        render={render}
        {...props}
      >
        {externalLink ? (
          <>
            {processedChildren}
            <SquareArrowOutUpRight aria-hidden="true" />
            <span className="sr-only">(opens in new window)</span>
          </>
        ) : (
          processedChildren
        )}
      </BaseButton>
    );
  }
);

Button.displayName = "Button";

type ActionButtonProps = ButtonProps & {
  tooltip?: string;
  keybind?: string;
};

const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    { tooltip, keybind, children, disabled, onClick, ...props },
    forwardedRef
  ) => {
    const buttonRef = React.useRef<HTMLButtonElement>(null);

    const handleKeybind = React.useCallback(() => {
      if (buttonRef.current && !disabled) {
        buttonRef.current.click();
      }
    }, [disabled]);

    useKeybind(keybind ?? "", handleKeybind, [disabled], {
      enabled: Boolean(keybind) && !disabled,
    });

    const setRefs = React.useCallback(
      (node: HTMLButtonElement | null) => {
        buttonRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef]
    );

    const button = (
      <Button ref={setRefs} disabled={disabled} onClick={onClick} {...props}>
        {children}
      </Button>
    );

    if (tooltip) {
      return (
        <Tooltip>
          <TooltipTrigger render={button} />
          <TooltipContent keybind={keybind}>{tooltip}</TooltipContent>
        </Tooltip>
      );
    }

    return button;
  }
);

ActionButton.displayName = "ActionButton";

export { ActionButton, Button, buttonVariants };
