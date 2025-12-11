import { cn } from "@workspace/ui/lib/utils";
import * as React from "react";

type LabelBadgeProps = {
  name: string;
  color: string;
  className?: string;
};

const LabelBadge = React.forwardRef<HTMLDivElement, LabelBadgeProps>(
  ({ name, color, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center gap-2 text-xs px-2 py-0.5 border rounded-full max-w-32",
          className,
        )}
      >
        <div
          className="size-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className="truncate grow shrink">{name}</div>
      </div>
    );
  },
);

LabelBadge.displayName = "LabelBadge";

export { LabelBadge };
