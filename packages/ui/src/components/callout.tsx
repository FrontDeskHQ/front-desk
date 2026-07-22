import { cn } from "@workspace/ui/lib/utils";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

const calloutVariants = cva("rounded-md border p-4 flex flex-col gap-1", {
  defaultVariants: {
    variant: "default",
  },
  variants: {
    variant: {
      default: "bg-background-secondary",
      warning:
        "bg-amber-50 border-amber-200/50 dark:bg-amber-500/5 dark:border-amber-500/15",
    },
  },
});

function Callout({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof calloutVariants>) {
  return (
    <div className={cn(calloutVariants({ variant }), className)} {...props} />
  );
}

export { Callout };
