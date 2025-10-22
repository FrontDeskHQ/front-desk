import { cn } from "../lib/utils";
import { Icon } from "./logo";

interface NavbarProps {
  className?: string;
}

export function Navbar({ className }: NavbarProps) {
  return (
    <nav
      className={cn(
        "w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className,
      )}
    >
      <div className="container flex h-16 items-center px-4">
        <div className="flex items-center gap-3">
          <div className="size-fit p-2 border rounded-xl bg-muted">
            <Icon className="size-6" />
          </div>
          <span className="text-lg font-medium">FrontDesk</span>
        </div>
      </div>
    </nav>
  );
}
