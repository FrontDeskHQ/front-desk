import { Card, CardContent } from "@workspace/ui/components/card";
import { CheckCheck, Eye } from "lucide-react";

export function NewOrgEmpty() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Eye className="size-8 text-foreground-secondary" />
        <div className="max-w-sm">
          <div className="text-foreground-primary text-sm font-medium">
            FrontDesk is watching your threads
          </div>
          <div className="text-foreground-secondary text-xs">
            Signals will appear here as we catch things.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function CaughtUpEmpty() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCheck className="size-6 text-foreground-secondary" />
        <div className="max-w-sm">
          <div className="text-foreground-primary text-sm font-medium">
            You're all caught up
          </div>
          <div className="text-foreground-secondary text-xs">
            FrontDesk handled everything in the background.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
