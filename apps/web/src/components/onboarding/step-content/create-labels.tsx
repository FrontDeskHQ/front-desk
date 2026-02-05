import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ArrowRight, ArrowUpRight } from "lucide-react";

export function CreateLabelsContent() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Create custom labels to categorize and filter your support threads.
      </p>
      <div className="grid grid-cols-2 gap-4 pt-2 -mt-2 border-t">
        <Button
          variant="link"
          className="gap-2"
          render={
            // biome-ignore lint/a11y/useAnchorContent: false positive
            <a
              href="/docs/labels"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Learn more about labels"
            />
          }
        >
          Learn more
          <ArrowUpRight />
        </Button>
        <Button
          render={<Link to="/app/settings/organization/labels" />}
          className="gap-2"
        >
          Manage labels
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
