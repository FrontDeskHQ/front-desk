import { Slot } from "@radix-ui/react-slot";
import { useKeybind } from "@workspace/ui/hooks/use-keybind";
import { cn } from "@workspace/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { SquareArrowOutUpRight } from "lucide-react";
import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-[#345BCA] text-primary shadow-xs hover:bg-[#345BCA]/90 border border-[#A1A1AA]/20",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background-primary shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-quaternary dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-7 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    externalLink?: boolean;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      externalLink = false,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    if (asChild && externalLink) {
      // When using asChild with externalLink, clone the child and add the icon
      return (
        <Comp
          data-slot="button"
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        >
          {React.isValidElement(children)
            ? React.cloneElement(
                children,
                {},
                (children.props as { children?: React.ReactNode }).children,
                <SquareArrowOutUpRight key="external-icon" />,
              )
            : children}
        </Comp>
      );
    }

    return (
      <Comp
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        {externalLink ? (
          <>
            {children}
            <SquareArrowOutUpRight aria-hidden="true" />
            <span className="sr-only">(opens in new window)</span>
          </>
        ) : (
          children
        )}
      </Comp>
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
