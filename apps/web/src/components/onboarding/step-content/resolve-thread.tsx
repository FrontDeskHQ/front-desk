import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ArrowRight, ArrowUpRight } from "lucide-react";

export function ResolveThreadContent() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        When a support issue is handled, mark the thread as resolved to notify
        the customer and keep your queue clean.
      </p>
      <div className="grid grid-cols-2 gap-4 pt-2 -mt-2 border-t">
        <Button
          variant="link"
          className="gap-2"
          render={
            // biome-ignore lint/a11y/useAnchorContent: false positive
            <a
              href="/docs/threads"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Learn more about resolving threads"
            />
          }
        >
          Learn more
          <ArrowUpRight />
        </Button>
        <Button render={<Link to="/app/threads" />} className="gap-2">
          View threads
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
