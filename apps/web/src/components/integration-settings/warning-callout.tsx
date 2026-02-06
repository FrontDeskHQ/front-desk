import { Callout } from "@workspace/ui/components/callout";
import { cn } from "@workspace/ui/lib/utils";

export function IntegrationWarningCallout({
  title,
  subtitle,
  className,
  ...props
}: {
  title: string;
  subtitle: string;
} & Omit<React.ComponentProps<typeof Callout>, "variant">) {
  return (
    <Callout variant="warning" className={cn("mb-4", className)} {...props}>
      <div className="flex items-center gap-2">{title}</div>
      <span className="text-foreground-secondary">{subtitle}</span>
    </Callout>
  );
}
