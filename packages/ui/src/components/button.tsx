import { Button as BaseButton } from "@base-ui-components/react";
import { useKeybind } from "@workspace/ui/hooks/use-keybind";
import { cn } from "@workspace/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { SquareArrowOutUpRight } from "lucide-react";
import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm transition disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        primary:
          "bg-[#345BCA] text-primary shadow-xs hover:bg-[#345BCA]/90 border border-[#A1A1AA]/20",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-quaternary dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 aria-invalid:border",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-6 rounded-sm gap-1.5 px-2 has-[>svg:first-child]:pl-1.5 has-[>svg:last-child]:pr-1.5 text-xs",
        md: "h-7 px-3.5 has-[>svg:first-child]:pl-3 has-[>svg:last-child]:pr-3 text-sm",
        lg: "h-9 px-4.5 has-[>svg:first-child]:pl-4 has-[>svg:last-child]:pr-4 font-medium",
        xl: "h-10 rounded-md px-6 text-lg",
        icon: "size-7",
        "icon-sm": "size-6",
        "icon-lg": "size-9",
        "icon-xl": "size-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
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
    ref,
  ) => {
    const processChildren = (children: React.ReactNode): React.ReactNode => {
      return React.Children.map(children, (child) => {
        if (typeof child === "string" || typeof child === "number") {
          return <span>{child}</span>;
        }
        return child;
      });
    };

    const processedChildren = processChildren(children);

    return (
      <BaseButton
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
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
  },
);

Button.displayName = "Button";

type ActionButtonProps = ButtonProps & {
  tooltip?: string;
  keybind?: string;
};

const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    { tooltip, keybind, children, disabled, onClick, ...props },
    forwardedRef,
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
      [forwardedRef],
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
  },
);

ActionButton.displayName = "ActionButton";

export { ActionButton, Button, buttonVariants };
