import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ArrowRight, ArrowUpRight } from "lucide-react";

export function InviteTeamContent() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Invite your team members to collaborate on customer support and resolve
        threads faster.
      </p>
      <div className="grid grid-cols-2 gap-4 pt-2 -mt-2 border-t">
        <Button
          variant="link"
          className="gap-2"
          render={
            // biome-ignore lint/a11y/useAnchorContent: false positive
            <a
              href="/docs/team-management"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Learn more about team management"
            />
          }
        >
          Learn more
          <ArrowUpRight />
        </Button>
        <Button
          render={<Link to="/app/settings/organization/team" />}
          className="gap-2"
        >
          Team settings
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
