import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ArrowRight, ArrowUpRight } from "lucide-react";

export function ConnectIntegrationContent() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Connect your existing community support channels to automatically sync
        threads to FrontDesk.
      </p>
      <div className="grid grid-cols-2 gap-4 pt-2 -mt-2 border-t">
        <Button
          variant="link"
          className="gap-2"
          render={
            // biome-ignore lint/a11y/useAnchorContent: false positive
            <a
              href="/docs/integrations"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Learn more about integrations"
            />
          }
        >
          Learn more
          <ArrowUpRight />
        </Button>
        <Button
          render={<Link to="/app/settings/organization/integration" />}
          className="gap-2"
        >
          Integration settings
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
