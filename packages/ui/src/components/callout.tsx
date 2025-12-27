import { cn } from "@workspace/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const calloutVariants = cva("rounded-md border p-4 flex flex-col gap-1", {
  variants: {
    variant: {
      default: "bg-background-secondary",
      // TODO: add more variants
    },
  },
  defaultVariants: {
    variant: "default",
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

export { Callout, type VariantProps as CalloutVariantProps };
