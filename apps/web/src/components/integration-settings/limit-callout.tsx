import { Link } from "@tanstack/react-router";
import { Callout } from "@workspace/ui/components/callout";
import { cn } from "@workspace/ui/lib/utils";
import { MAX_STARTER_INTEGRATIONS } from "~/lib/hooks/query/use-plan-limits";

export function LimitCallout({
  className,
  ...props
}: React.ComponentProps<typeof Callout>) {
  return (
    <Callout
      className={cn("bg-background-tertiary border-tertiary", className)}
      {...props}
    >
      <div>Integration limit reached</div>
      <span className="text-foreground-secondary">
        You&apos;ve reached the maximum of {MAX_STARTER_INTEGRATIONS}{" "}
        integrations on your current plan.
        <br />
        <Link
          className="underline hover:text-primary transition-colors"
          to="/app/settings/organization/billing"
        >
          Upgrade to Pro
        </Link>{" "}
        to enable unlimited integrations.
      </span>
    </Callout>
  );
}
