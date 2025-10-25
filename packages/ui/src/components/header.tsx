import { cn } from "../lib/utils";
import { Icon } from "./logo";

interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  return (
    <header
      className={cn(
        "w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className,
      )}
    >
      <div className="container flex items-center px-8 py-4">
        <div className="flex items-center gap-3">
          <div className="size-fit border rounded-xl bg-muted">
            <Icon className="size-6" />
          </div>
          <span className="text-lg font-medium">FrontDesk</span>
        </div>
      </div>
    </header>
  );
}
